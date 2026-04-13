// TicketHub Parts Scraper — Content Script
// Runs on Amazon product pages. Scrapes product details and sends to popup.

;(function () {
  function scrapeProduct() {
    const title =
      document.getElementById('productTitle')?.textContent?.trim() ??
      document.querySelector('#title')?.textContent?.trim() ??
      ''

    // ASIN from URL or page data
    let asin = ''
    const urlMatch = window.location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)
    if (urlMatch) asin = urlMatch[1]
    if (!asin) {
      const input = document.querySelector('input[name="ASIN"]')
      if (input) asin = input.value
    }

    // Price
    const priceWhole =
      document.querySelector('.a-price .a-price-whole')?.textContent?.replace(/[^0-9]/g, '') ?? ''
    const priceFraction =
      document.querySelector('.a-price .a-price-fraction')?.textContent?.replace(/[^0-9]/g, '') ?? '00'
    const priceCents = priceWhole ? parseInt(priceWhole) * 100 + parseInt(priceFraction) : 0

    // Fallback price from other selectors
    let finalPriceCents = priceCents
    if (!finalPriceCents) {
      const priceText =
        document.getElementById('priceblock_ourprice')?.textContent ??
        document.getElementById('priceblock_dealprice')?.textContent ??
        document.querySelector('.a-price .a-offscreen')?.textContent ??
        ''
      const match = priceText.match(/\$?([\d,]+)\.(\d{2})/)
      if (match) {
        finalPriceCents = parseInt(match[1].replace(/,/g, '')) * 100 + parseInt(match[2])
      }
    }

    // Image
    const imageUrl =
      document.getElementById('landingImage')?.src ??
      document.getElementById('imgBlkFront')?.src ??
      document.querySelector('#main-image-container img')?.src ??
      ''

    // Vendor (sold by)
    const vendorEl = document.getElementById('sellerProfileTriggerId')
    const vendor = vendorEl?.textContent?.trim() ?? 'Amazon'

    return {
      title,
      asin,
      priceCents: finalPriceCents,
      imageUrl,
      vendor,
      productUrl: window.location.href,
    }
  }

  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SCRAPE_PRODUCT') {
      sendResponse(scrapeProduct())
    }
    return true
  })
})()
