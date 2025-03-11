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
export function fetchTickets(jiraUrl, apiToken, isBackground = false) {
  return new Promise((resolve, reject) => {
    const MIN_FETCH_INTERVAL = 300000; // Increase to 5 minutes (300,000 ms)
    const PAGE_SIZE = 100; // Fetch 100 tickets per request for pagination
    const INITIAL_BACKOFF = 60000; // Start with 1 minute backoff for 429 errors
    const MAX_BACKOFF = 600000; // Max backoff of 10 minutes
    let backoffDelay = INITIAL_BACKOFF;

    chrome.storage.sync.get(["lastFetchTimestamp", "maxTickets"], (data) => {
      const lastFetchTimestamp = data.lastFetchTimestamp || 0;
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchTimestamp;

      if (timeSinceLastFetch < MIN_FETCH_INTERVAL && !isBackground) {
        console.log(
          `Skipping fetch: ${Math.round((MIN_FETCH_INTERVAL - timeSinceLastFetch) / 1000)} seconds until next allowed fetch`,
        );
        chrome.storage.local.get("cachedTickets", (cacheData) => {
          if (cacheData.cachedTickets) {
            if (!isBackground) {
              chrome.storage.local.get("notifications", (notifData) => {
                const notifications = notifData.notifications || {};
                renderTickets(cacheData.cachedTickets, jiraUrl, notifications);
              });
            }
            resolve(cacheData.cachedTickets);
          } else {
            if (!isBackground)
              document.getElementById("tickets").innerHTML =
                "<p>No cached tickets available</p>";
            resolve(null);
          }
        });
        return;
      }

      const maxTickets = data.maxTickets || 100; // Default to 100 if not set
      let allTickets = [];
      let startAt = 0;

      function fetchPageWithRetry(attempt = 1) {
        const jql = `assignee = currentUser() AND status != Closed ORDER BY updated DESC`; // Sort by updated descending
        const apiUrl = `${jiraUrl}rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=key,summary,status,updated&maxResults=${PAGE_SIZE}&startAt=${startAt}`;

        console.log("Fetching page from:", apiUrl);

        return fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        })
          .then((response) => {
            if (!response.ok) {
              if (response.status === 429 && attempt <= 3) {
                // Handle 429 Too Many Requests with exponential backoff
                const delay = Math.min(
                  backoffDelay * Math.pow(2, attempt - 1),
                  MAX_BACKOFF,
                );
                console.warn(
                  `Rate limit hit (429), retrying after ${delay / 1000} seconds... (Attempt ${attempt})`,
                );
                return new Promise((resolve) =>
                  setTimeout(resolve, delay),
                ).then(() => fetchPageWithRetry(attempt + 1));
              }
              return response.text().then((text) => {
                let errorMsg = `HTTP ${response.status}: `;
                if (response.status === 401)
                  errorMsg += "Unauthorized - Check API token";
                else if (response.status === 404)
                  errorMsg += "Not Found - Check Jira URL";
                else if (response.status === 403)
                  errorMsg += "Forbidden - Check permissions";
                else if (response.status === 429)
                  errorMsg +=
                    "Rate limit exceeded - try increasing polling interval";
                else errorMsg += text || "Unknown error";
                throw new Error(errorMsg);
              });
            }
            return response.json();
          })
          .then((data) => {
            allTickets = allTickets.concat(data.issues);
            const total = data.total || 0;
            if (
              allTickets.length < Math.min(maxTickets, total) &&
              startAt + PAGE_SIZE < total
            ) {
              startAt += PAGE_SIZE;
              backoffDelay = INITIAL_BACKOFF; // Reset backoff on successful fetch
              return fetchPageWithRetry(); // Recursively fetch the next page
            }
            return allTickets.slice(0, maxTickets); // Limit to maxTickets
          });
      }

      fetchPageWithRetry()
        .then((tickets) => {
          const combinedData = { issues: tickets, total: tickets.length }; // Mimic the Jira API response structure
          console.log("Parsed response:", combinedData);
          const newTimestamp = now;
          chrome.storage.sync.set({ lastFetchTimestamp: newTimestamp }, () => {
            if (chrome.runtime.lastError) {
              console.warn(
                "Failed to save lastFetchTimestamp:",
                chrome.runtime.lastError,
              );
            }
            chrome.storage.local.set(
              { cachedTickets: combinedData },
              (result) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "Quota exceeded or storage error:",
                    chrome.runtime.lastError,
                  );
                  document.getElementById("storageUsage").textContent =
                    "Current Usage: Exceeded 5 MB limit - reduce max tickets";
                } else {
                  if (isBackground) {
                    chrome.storage.local.get(
                      ["ticketUpdates", "notifications"],
                      (cacheData) => {
                        const ticketUpdates = cacheData.ticketUpdates || {};
                        const notifications = cacheData.notifications || {};
                        const updatedTickets = [];

                        combinedData.issues.forEach((issue) => {
                          const ticketId = issue.key;
                          const lastUpdated =
                            ticketUpdates[ticketId]?.updated || null;

                          if (
                            lastUpdated &&
                            new Date(issue.fields.updated) >
                              new Date(lastUpdated)
                          ) {
                            updatedTickets.push({
                              id: ticketId,
                              updated: issue.fields.updated,
                            });
                          }
                          ticketUpdates[ticketId] = {
                            updated: issue.fields.updated,
                          };
                        });

                        chrome.storage.local.set({ ticketUpdates }, () => {
                          if (updatedTickets.length > 0) {
                            verifyUpdates(
                              updatedTickets,
                              jiraUrl,
                              apiToken,
                              notifications,
                              () => {
                                if (!isBackground)
                                  renderTickets(
                                    combinedData,
                                    jiraUrl,
                                    notifications,
                                  );
                                resolve(combinedData);
                              },
                            );
                          } else {
                            if (!isBackground)
                              renderTickets(
                                combinedData,
                                jiraUrl,
                                notifications,
                              );
                            resolve(combinedData);
                          }
                        });
                      },
                    );
                  } else {
                    chrome.storage.local.get("notifications", (notifData) => {
                      const notifications = notifData.notifications || {};
                      renderTickets(combinedData, jiraUrl, notifications);
                    });
                    resolve(combinedData);
                  }
                }
              },
            );
          });
        })
        .catch((error) => {
          if (!isBackground) {
            document.getElementById("tickets").innerHTML =
              `<p>Error: ${error.message}</p>`;
            console.error("Fetch error details:", {
              message: error.message,
              url: apiUrl,
              apiToken: "[hidden]",
            });
          }
          reject(error);
        });
    });
  });
}

function verifyUpdates(
  updatedTickets,
  jiraUrl,
  apiToken,
  notifications,
  callback,
) {
  chrome.storage.sync.get("currentUser", (data) => {
    const currentUser = data.currentUser;
    if (!currentUser) {
      console.warn("Current user not set, skipping update verification");
      callback();
      return;
    }

    const promises = updatedTickets.map((ticket) => {
      return fetch(`${jiraUrl}rest/api/2/issue/${ticket.id}?expand=changelog`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      })
        .then((response) => {
          if (!response.ok)
            throw new Error(`Failed to fetch changelog for ${ticket.id}`);
          return response.json();
        })
        .then((data) => {
          const latestChange = data.changelog.histories[0];
          if (latestChange && latestChange.author.name !== currentUser) {
            notifications[ticket.id] = { lastNotified: ticket.updated };
          }
        })
        .catch((error) => {
          console.error(`Error verifying update for ${ticket.id}:`, error);
        });
    });

    Promise.all(promises).then(() => {
      chrome.storage.local.set({ notifications }, callback);
    });
  });
}

// Utility function to convert timestamp to relative time
function getRelativeTime(timestamp) {
  const now = Date.now();
  const updatedTime = new Date(timestamp).getTime();
  const diffInSeconds = Math.floor((now - updatedTime) / 1000);

  if (diffInSeconds < 60) {
    return "moments ago";
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
}

export function renderTickets(data, jiraUrl, notifications = {}) {
  const ticketsDiv = document.getElementById("tickets");
  ticketsDiv.innerHTML = "";
  const markAllReadBtn = document.getElementById("markAllRead");

  if (!data.issues || data.issues.length === 0) {
    ticketsDiv.innerHTML = "<p>No open tickets found</p>";
    markAllReadBtn.style.display = "none";
    return;
  }

  if (Object.keys(notifications).length > 0) {
    markAllReadBtn.style.display = "block";
  } else {
    markAllReadBtn.style.display = "none";
  }

  const ticketsByProject = {};
  data.issues.forEach((issue) => {
    const projectKey = issue.key.split("-")[0];
    if (!ticketsByProject[projectKey]) {
      ticketsByProject[projectKey] = [];
    }
    ticketsByProject[projectKey].push(issue);
  });

  Object.keys(ticketsByProject).forEach((projectKey) => {
    ticketsByProject[projectKey].sort((a, b) => {
      return new Date(b.fields.updated) - new Date(a.fields.updated);
    });
  });

  const sortedProjects = Object.keys(ticketsByProject).sort((a, b) => {
    const latestA = ticketsByProject[a][0].fields.updated;
    const latestB = ticketsByProject[b][0].fields.updated;
    return new Date(latestB) - new Date(latestA);
  });

  sortedProjects.forEach((projectKey) => {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.className = "chevron"; // Add class for custom chevron
    const projectName = document.createElement("span");
    projectName.className = "project-name";
    projectName.textContent = `${projectKey} (${ticketsByProject[projectKey].length} tickets)`;
    const dot = document.createElement("span");
    dot.className = "notification-dot";

    // Check if any ticket in this project has a notification
    const hasNotification = ticketsByProject[projectKey].some(
      (issue) => notifications[issue.key],
    );
    if (hasNotification) {
      dot.style.display = "inline-block";
    }

    summary.appendChild(projectName);
    summary.appendChild(dot); // Keep dot at the end, positioned by CSS
    details.appendChild(summary);

    ticketsByProject[projectKey].forEach((issue) => {
      const ticketDiv = document.createElement("div");
      ticketDiv.className = "ticket";

      // Create a wrapper for the dot and title to prevent wrapping under the dot
      const titleWrapper = document.createElement("div");
      titleWrapper.className = "title-wrapper";
      titleWrapper.style.display = "flex";
      titleWrapper.style.alignItems = "flex-start";

      const dot = document.createElement("span");
      dot.className = "ticket-notification-dot";
      if (notifications[issue.key] && notifications[issue.key].lastNotified) {
        // Ensure notification exists
        dot.style.display = "inline-block"; // Display dot to the left
      } else {
        dot.style.display = "none"; // Explicitly hide if no notification
      }

      const link = document.createElement("a");
      link.href = `${jiraUrl}browse/${issue.key}`;
      link.textContent = `${issue.key}: ${issue.fields.summary}`;
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: link.href });
        // Clear notification only when the ticket link is clicked
        if (notifications[issue.key]) {
          delete notifications[issue.key];
          chrome.storage.local.set({ notifications }, () => {
            dot.style.display = "none";
            if (Object.keys(notifications).length === 0) {
              markAllReadBtn.style.display = "none";
            }
            // Re-render to update the project dot if needed
            chrome.storage.local.get("cachedTickets", (cacheData) => {
              if (cacheData.cachedTickets) {
                renderTickets(cacheData.cachedTickets, jiraUrl, notifications);
              }
            });
          });
        }
      });

      // Open link and clear notification when clicking anywhere in ticket div
      ticketDiv.addEventListener("click", (e) => {
        if (!e.target.closest("a")) {
          // Avoid triggering if clicking the link itself
          e.preventDefault();
          chrome.tabs.create({ url: link.href });
          if (notifications[issue.key]) {
            delete notifications[issue.key];
            chrome.storage.local.set({ notifications }, () => {
              dot.style.display = "none";
              if (Object.keys(notifications).length === 0) {
                markAllReadBtn.style.display = "none";
              }
              chrome.storage.local.get("cachedTickets", (cacheData) => {
                if (cacheData.cachedTickets) {
                  renderTickets(
                    cacheData.cachedTickets,
                    jiraUrl,
                    notifications,
                  );
                }
              });
            });
          }
        }
      });

      const status = document.createElement("div");
      status.className = "status";
      status.textContent = `Status: ${issue.fields.status.name}`;

      const updated = document.createElement("div");
      updated.className = "updated";
      updated.textContent = `Updated: ${getRelativeTime(issue.fields.updated)}`; // Use relative time

      titleWrapper.appendChild(dot);
      titleWrapper.appendChild(link);
      ticketDiv.appendChild(titleWrapper);
      ticketDiv.appendChild(status);
      ticketDiv.appendChild(updated);
      details.appendChild(ticketDiv);
    });

    ticketsDiv.appendChild(details);
  });
}
