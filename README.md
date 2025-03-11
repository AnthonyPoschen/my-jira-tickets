My Jira Tickets Chrome Extension
My Jira Tickets Icon
My Jira Tickets is a Chrome extension that helps you keep track of your open Jira tickets right from your browser. Designed for Jira users who want quick access to their assigned tickets, this extension fetches tickets in the background, displays them in a clean popup, and notifies you of updates with a visual dot on the extension icon. Built with simplicity and efficiency in mind, it’s perfect for developers, project managers, and anyone working with Jira.
Features
Fetch Open Tickets: Automatically retrieves your open Jira tickets (status not "Closed") using the Jira REST API.

Background Polling: Polls for updates in the background at configurable intervals (5 minutes to 1 hour), even when the popup is closed.

Notifications: Displays a red dot on the extension icon and within the popup for tickets updated by others, ensuring you never miss important changes.

Grouped by Project: Organizes tickets by project with collapsible sections for easy navigation.

Relative Timestamps: Shows when tickets were last updated in a human-readable format (e.g., "5 minutes ago").

Customizable Limits: Configure the maximum number of tickets fetched (100 to 1000) to manage storage usage.

Storage Monitoring: Displays current storage usage in the config screen to help you stay within Chrome’s 5 MB limit.

Rate Limit Handling: Gracefully handles Jira API rate limits with exponential backoff and a minimum 5-minute fetch interval.

Dark Mode Support: Automatically adapts to your browser’s dark mode for a seamless experience.

Installation
Follow these steps to install the My Jira Tickets extension in Chrome:
Option 1: Install from Chrome Web Store (Recommended)
Visit the Chrome Web Store listing: INSERT_CHROME_WEB_STORE_URL_HERE

Click Add to Chrome and confirm the installation.

Once installed, the extension icon will appear in your Chrome toolbar.

Option 2: Install from Source (Developer Mode)
Clone or download this repository:
bash

git clone https://github.com/INSERT_YOUR_GITHUB_USERNAME_HERE/my-jira-tickets.git

Open Chrome and navigate to chrome://extensions/.

Enable Developer Mode (toggle in the top-right corner).

Click Load Unpacked and select the directory where you cloned/downloaded the repository.

The extension will appear in your Chrome toolbar.

Usage
Configure the Extension:
Click the extension icon in the Chrome toolbar to open the popup.

Click Configure to set up your Jira instance.

Enter your Jira Base URL (e.g., https://jira.mycompany.com) and API Token (generate one from your Jira account settings).

Set your preferred polling interval (5 minutes to 1 hour, or "Off" to disable auto-refresh).

Adjust the maximum tickets fetched (100 to 1000) to balance storage usage.

Click Save and grant the necessary permissions when prompted.

View Your Tickets:
Once configured, the popup will display your open Jira tickets, grouped by project.

Click a ticket to open it in a new tab.

Tickets updated by others will show a red dot notification.

Manage Notifications:
A red dot on the extension icon indicates new updates.

Inside the popup, click Mark All Read to clear notifications, or click individual tickets to dismiss their notifications.

Monitor Storage:
Check the "Current Usage" in the config screen to ensure you’re within Chrome’s 5 MB storage limit.

Reduce the "Maximum Tickets Fetched" if you approach the limit.

Screenshots
Popup View
Tickets grouped by project with notifications.
Config Screen
Configure your Jira URL, API token, polling interval, and max tickets.
Contributing
We welcome contributions to improve My Jira Tickets! Here’s how you can get involved:
Fork the repository and create a new branch for your feature or bugfix.

Make your changes and test thoroughly.

Submit a pull request with a clear description of your changes.

Please ensure your code follows the existing style and includes appropriate comments. If you have ideas for new features, feel free to open an issue to discuss them first.
