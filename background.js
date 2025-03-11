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
import { fetchTickets } from "./utils.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(
    ["jiraBaseUrl", "apiToken", "hostPermission", "pollInterval"],
    (data) => {
      if (
        data.jiraBaseUrl &&
        data.apiToken &&
        data.hostPermission &&
        data.pollInterval &&
        data.pollInterval > 0
      ) {
        chrome.permissions.contains(
          {
            origins: [data.hostPermission],
          },
          (result) => {
            if (result) {
              startPolling(data.jiraBaseUrl, data.apiToken, data.pollInterval);
            }
          },
        );
      }
    },
  );
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.pollInterval) {
    chrome.storage.sync.get(
      ["jiraBaseUrl", "apiToken", "hostPermission", "pollInterval"],
      (data) => {
        if (data.jiraBaseUrl && data.apiToken && data.hostPermission) {
          chrome.alarms.clear("fetchTickets", () => {
            if (data.pollInterval && data.pollInterval > 0) {
              chrome.permissions.contains(
                {
                  origins: [data.hostPermission],
                },
                (result) => {
                  if (result) {
                    startPolling(
                      data.jiraBaseUrl,
                      data.apiToken,
                      data.pollInterval,
                    );
                  }
                },
              );
            }
          });
        }
      },
    );
  }
});

function startPolling(jiraUrl, apiToken, interval) {
  chrome.alarms.create("fetchTickets", {
    periodInMinutes: interval / 60000, // Convert milliseconds to minutes
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "fetchTickets") {
      fetchTickets(jiraUrl, apiToken, true)
        .then(() => {
          console.log("Background fetch completed");
          chrome.storage.local.set({ rateLimitCooldown: false }); // Reset cooldown on success
        })
        .catch((error) => {
          console.error("Background fetch failed:", error);
          if (error.message.includes("429")) {
            // Throttle polling on 429 error
            const cooldownPeriod = 600000; // 10 minutes cooldown
            chrome.storage.local.set({ rateLimitCooldown: true }, () => {
              chrome.alarms.clear("fetchTickets", () => {
                console.log(
                  `Rate limit hit, pausing polling for ${cooldownPeriod / 60000} minutes`,
                );
                setTimeout(() => {
                  chrome.storage.local.set({ rateLimitCooldown: false }, () => {
                    chrome.storage.sync.get(["pollInterval"], (data) => {
                      if (data.pollInterval && data.pollInterval > 0) {
                        chrome.alarms.create("fetchTickets", {
                          periodInMinutes: data.pollInterval / 60000,
                        });
                        console.log("Resumed polling after cooldown");
                      }
                    });
                  });
                }, cooldownPeriod);
              });
            });
          }
        });
    }
  });

  // Initial fetch on startup
  fetchTickets(jiraUrl, apiToken, true)
    .then(() => {
      console.log("Initial background fetch completed");
    })
    .catch((error) => {
      console.error("Initial background fetch failed:", error);
      if (error.message.includes("429")) {
        const cooldownPeriod = 600000; // 10 minutes cooldown
        chrome.storage.local.set({ rateLimitCooldown: true }, () => {
          chrome.alarms.clear("fetchTickets", () => {
            console.log(
              `Rate limit hit on initial fetch, pausing polling for ${cooldownPeriod / 60000} minutes`,
            );
            setTimeout(() => {
              chrome.storage.local.set({ rateLimitCooldown: false }, () => {
                chrome.storage.sync.get(["pollInterval"], (data) => {
                  if (data.pollInterval && data.pollInterval > 0) {
                    chrome.alarms.create("fetchTickets", {
                      periodInMinutes: data.pollInterval / 60000,
                    });
                    console.log("Resumed polling after cooldown");
                  }
                });
              });
            }, cooldownPeriod);
          });
        });
      }
    });
}
