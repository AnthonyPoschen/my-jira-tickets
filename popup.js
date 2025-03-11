// MIT License
//
// Copyright (c) 2025 Anthony Poschen
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
import { fetchTickets, renderTickets } from "./utils.js";

document.addEventListener("DOMContentLoaded", () => {
  const ticketsDiv = document.getElementById("tickets");
  const configDiv = document.getElementById("config");
  const configureBtn = document.getElementById("configureBtn");
  const saveConfigBtn = document.getElementById("saveConfig");
  const closeConfigBtn = document.getElementById("closeConfig");
  const testConfigBtn = document.getElementById("testConfig");
  const markAllReadBtn = document.getElementById("markAllRead");
  const jiraBaseUrlInput = document.getElementById("jiraBaseUrl");
  const apiTokenInput = document.getElementById("apiToken");
  const pollIntervalSelect = document.getElementById("pollInterval");
  const maxTicketsSelect = document.getElementById("maxTickets");
  const testFeedback = document.getElementById("testFeedback");
  const errorMessage = document.getElementById("errorMessage");
  const storageUsage = document.getElementById("storageUsage");

  const MIN_FETCH_INTERVAL = 300000; // 5 minutes (sync with utils.js)

  // Function to show error message with animation
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
    // Reset animation by toggling display
    setTimeout(() => {
      errorMessage.style.animation = "none";
      errorMessage.offsetHeight; // Trigger reflow
      errorMessage.style.animation = "slideOut 1.8s ease-out forwards"; // Match the CSS duration
    }, 0);
    setTimeout(() => {
      errorMessage.style.display = "none";
    }, 1800); // Hide after animation (1.8s)
  }

  // Function to calculate and display storage usage
  function updateStorageUsage() {
    chrome.storage.local.get(["cachedTickets"], (result) => {
      if (result.cachedTickets) {
        const sizeInBytes = new Blob([JSON.stringify(result.cachedTickets)])
          .size;
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
        storageUsage.textContent = `Current Usage: ${sizeInMB} MB / 5 MB`;
      } else {
        storageUsage.textContent = "Current Usage: 0 MB / 5 MB";
      }
    });
  }

  // Function to update the extension icon based on notifications
  function updateIcon(hasNotifications) {
    const iconPath = hasNotifications
      ? {
          16: "icons/icon16_notif.png",
          48: "icons/icon48_notif.png",
          128: "icons/icon128_notif.png",
        }
      : {
          16: "icons/icon16.png",
          48: "icons/icon48.png",
          128: "icons/icon128.png",
        };
    chrome.action.setIcon({ path: iconPath }, () => {
      if (chrome.runtime.lastError) {
        console.error("Failed to update icon:", chrome.runtime.lastError);
      }
    });
  }

  // Load and autofill saved config
  chrome.storage.sync.get(
    [
      "jiraBaseUrl",
      "apiToken",
      "hostPermission",
      "pollInterval",
      "maxTickets",
      "lastFetchTimestamp",
    ],
    (data) => {
      if (data.jiraBaseUrl) jiraBaseUrlInput.value = data.jiraBaseUrl;
      if (data.apiToken) apiTokenInput.value = data.apiToken;
      pollIntervalSelect.value = data.pollInterval || "0";
      maxTicketsSelect.value = data.maxTickets || "100"; // Default to 100

      // Always load cached tickets on popup open
      chrome.storage.local.get(
        ["cachedTickets", "notifications"],
        (cacheData) => {
          const notifications = cacheData.notifications || {};
          if (cacheData.cachedTickets) {
            renderTickets(
              cacheData.cachedTickets,
              data.jiraBaseUrl || "",
              notifications,
            );
            const hasNotifications = Object.keys(notifications).length > 0;
            updateIcon(hasNotifications); // Update icon based on notifications
            if (hasNotifications) {
              markAllReadBtn.style.display = "block";
            }
          } else {
            ticketsDiv.innerHTML = "<p>No cached tickets available</p>";
            updateIcon(false); // No notifications if no tickets
          }
        },
      );

      if (data.jiraBaseUrl && data.apiToken && data.hostPermission) {
        checkAndFetchTickets(
          data.jiraBaseUrl,
          data.apiToken,
          data.hostPermission,
        );
      } else {
        ticketsDiv.style.display = "none"; // Hide tickets if not configured
      }
      updateStorageUsage(); // Display storage usage when config loads
    },
  );

  // Toggle config visibility and manage UI
  configureBtn.addEventListener("click", () => {
    configDiv.style.display = "block";
    ticketsDiv.style.display = "none";
    configureBtn.style.display = "none";
    testFeedback.style.display = "none";
    markAllReadBtn.style.display = "none"; // Hide Mark All Read when config is shown
  });

  // Test configuration
  testConfigBtn.addEventListener("click", () => {
    const jiraBaseUrl = jiraBaseUrlInput.value.trim();
    const apiToken = apiTokenInput.value.trim();

    if (!jiraBaseUrl || !apiToken) {
      testFeedback.textContent = "Please fill in all fields.";
      testFeedback.className = "error";
      testFeedback.style.display = "block";
      return;
    }

    let normalizedUrl = jiraBaseUrl;
    if (!normalizedUrl.endsWith("/")) normalizedUrl += "/";
    if (
      !normalizedUrl.startsWith("https://") &&
      !normalizedUrl.startsWith("http://")
    ) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const jql = "assignee = currentUser() AND status != Closed";
    const apiUrl = `${normalizedUrl}rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=key,summary,status,updated&maxResults=1`;

    fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.issues && data.issues.length > 0) {
          testFeedback.textContent =
            "Connection successful! Configuration is valid.";
          testFeedback.className = "success";
        } else {
          testFeedback.textContent =
            "No tickets found, but connection is valid.";
          testFeedback.className = "success";
        }
        testFeedback.style.display = "block";
      })
      .catch((error) => {
        testFeedback.textContent = `Test failed: ${error.message}`;
        testFeedback.className = "error";
        testFeedback.style.display = "block";
      });
  });

  // Save config and fetch current user (never block save)
  saveConfigBtn.addEventListener("click", () => {
    const jiraBaseUrl = jiraBaseUrlInput.value.trim();
    const apiToken = apiTokenInput.value.trim();
    const pollInterval = parseInt(pollIntervalSelect.value);
    const maxTickets = parseInt(maxTicketsSelect.value);

    if (!jiraBaseUrl || !apiToken) {
      alert("Please fill in all fields.");
      return;
    }

    let normalizedUrl = jiraBaseUrl;
    if (!normalizedUrl.endsWith("/")) normalizedUrl += "/";
    const hostPermission = normalizedUrl + "*";

    if (
      !normalizedUrl.startsWith("https://") &&
      !normalizedUrl.startsWith("http://")
    ) {
      normalizedUrl = `https://${normalizedUrl}`;
      hostPermission = `https://${hostPermission}`;
    }

    // Fetch current user (non-blocking)
    fetch(`${normalizedUrl}rest/api/2/myself`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          console.warn(
            "Failed to fetch current user, proceeding without it:",
            response.status,
          );
          return { name: "unknown" }; // Default if fetch fails
        }
        return response.json();
      })
      .then((user) => {
        chrome.storage.sync.set(
          {
            jiraBaseUrl: normalizedUrl,
            apiToken,
            hostPermission,
            pollInterval,
            maxTickets,
            currentUser: user.name,
          },
          () => {
            chrome.permissions.request(
              {
                origins: [hostPermission],
              },
              (granted) => {
                if (granted) {
                  configDiv.style.display = "none";
                  ticketsDiv.style.display = "block";
                  configureBtn.style.display = "block";
                  markAllReadBtn.style.display = "block"; // Show Mark All Read after saving
                  checkAndFetchTickets(normalizedUrl, apiToken, hostPermission);
                  updateStorageUsage(); // Update storage usage after save
                } else {
                  ticketsDiv.innerHTML =
                    "<p>Permission denied for Jira domain. Please grant access.</p>";
                }
              },
            );
          },
        );
      })
      .catch((error) => {
        console.error("Error fetching current user:", error);
        // Proceed with save even if user fetch fails
        chrome.storage.sync.set(
          {
            jiraBaseUrl: normalizedUrl,
            apiToken,
            hostPermission,
            pollInterval,
            maxTickets,
            currentUser: "unknown",
          },
          () => {
            chrome.permissions.request(
              {
                origins: [hostPermission],
              },
              (granted) => {
                if (granted) {
                  configDiv.style.display = "none";
                  ticketsDiv.style.display = "block";
                  configureBtn.style.display = "block";
                  markAllReadBtn.style.display = "block"; // Show Mark All Read after saving
                  checkAndFetchTickets(normalizedUrl, apiToken, hostPermission);
                  updateStorageUsage(); // Update storage usage after save
                } else {
                  ticketsDiv.innerHTML =
                    "<p>Permission denied for Jira domain. Please grant access.</p>";
                }
              },
            );
          },
        );
      });
  });

  // Close config without saving
  closeConfigBtn.addEventListener("click", () => {
    configDiv.style.display = "none";
    ticketsDiv.style.display = "block";
    configureBtn.style.display = "block";
    testFeedback.style.display = "none";
    markAllReadBtn.style.display = "block"; // Show Mark All Read when closing config
    updateStorageUsage(); // Update storage usage when closing config
    chrome.storage.local.get("cachedTickets", (cacheData) => {
      if (cacheData.cachedTickets) {
        chrome.storage.sync.get("jiraBaseUrl", (syncData) => {
          renderTickets(cacheData.cachedTickets, syncData.jiraBaseUrl || "");
        });
      }
    });
  });

  // Mark all notifications as read
  markAllReadBtn.addEventListener("click", () => {
    chrome.storage.local.set({ notifications: {} }, () => {
      markAllReadBtn.style.display = "none";
      chrome.storage.local.get("cachedTickets", (cacheData) => {
        if (cacheData.cachedTickets) {
          chrome.storage.sync.get("jiraBaseUrl", (syncData) => {
            renderTickets(cacheData.cachedTickets, syncData.jiraBaseUrl || "");
            updateIcon(false); // Clear the notification dot when all are read
          });
        }
      });
    });
  });

  function checkAndFetchTickets(jiraUrl, apiToken, hostPermission) {
    chrome.permissions.contains(
      {
        origins: [hostPermission],
      },
      (result) => {
        if (result) {
          chrome.storage.local.get(["rateLimitCooldown"], (data) => {
            if (data.rateLimitCooldown) {
              ticketsDiv.innerHTML = `<p>Rate limit exceeded. Fetching paused for a while. Try again later or increase polling interval.</p>`;
              return;
            }
            fetchTickets(jiraUrl, apiToken)
              .then(() => {
                chrome.storage.local.get(["notifications"], (notifData) => {
                  const hasNotifications =
                    Object.keys(notifData.notifications || {}).length > 0;
                  updateIcon(hasNotifications); // Update icon after successful fetch
                });
              })
              .catch((error) => {
                chrome.storage.local.get("cachedTickets", (cacheData) => {
                  if (cacheData.cachedTickets) {
                    chrome.storage.local.get("notifications", (notifData) => {
                      renderTickets(
                        cacheData.cachedTickets,
                        jiraUrl,
                        notifData.notifications || {},
                      );
                      const hasNotifications =
                        Object.keys(notifData.notifications || {}).length > 0;
                      updateIcon(hasNotifications); // Update icon on error with current notifications
                    });
                  }
                  showError(`Fetch failed: ${error.message}`);
                });
              });
          });
        } else {
          ticketsDiv.innerHTML =
            "<p>Please configure and grant permission for your Jira domain.</p>";
          configDiv.style.display = "block";
          ticketsDiv.style.display = "none";
        }
      },
    );
  }
});
