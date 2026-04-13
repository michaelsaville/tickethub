# TicketHub Parts Scraper — Chrome Extension

Scrapes product details from Amazon/Amazon Business product pages and adds them as parts to TicketHub tickets.

## Setup

1. Add icons (16x16, 48x48, 128x128 PNG) to the `icons/` directory
2. Open `chrome://extensions` → Enable Developer Mode
3. Click "Load unpacked" → select this `extension-parts/` directory
4. Click the extension icon → enter your TicketHub URL (e.g., `https://tickethub.pcc2k.com`)
5. Make sure you're logged into TicketHub in the same browser

## Usage

1. Navigate to any Amazon product page
2. Click the extension icon
3. Select a ticket from the dropdown
4. Set quantity and markup %
5. Click "Add Part to Ticket"

The part will appear on the ticket's Parts tab with cost price (Amazon) and client price (with markup).

## How it works

- **Content script** (`content.js`) runs on Amazon product pages and scrapes: title, ASIN, price, image, vendor
- **Popup** (`popup.html` + `popup.js`) shows the scraped product, lets you pick a ticket, and POSTs to `/api/tickets/:id/parts`
- Authentication uses the existing TicketHub session cookie (same browser)
