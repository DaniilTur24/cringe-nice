import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

const screenshots = []
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`)

try {
  log('Opening http://localhost:5173')
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'verify-1-initial.png' })
  log('Screenshot 1: initial state')

  // Wait for loading to finish (step transitions from 'loading' to 'email')
  await page.waitForFunction(() => {
    const inputs = document.querySelectorAll('input[type="email"], input[type="text"]')
    return inputs.length > 0
  }, { timeout: 10000 })

  await page.screenshot({ path: 'verify-2-email-screen.png' })
  log('Screenshot 2: email screen visible')

  const emailInput = page.locator('input[type="email"]').first()
  if (!await emailInput.isVisible()) {
    // try text input
    const textInput = page.locator('input[type="text"]').first()
    await textInput.fill('daniilturovskiy1@gmail.com')
  } else {
    await emailInput.fill('daniilturovskiy1@gmail.com')
  }
  log('Filled in email: daniilturovskiy1@gmail.com')

  await page.screenshot({ path: 'verify-3-email-filled.png' })

  // Intercept network requests to catch any SMTP/auth errors
  const errors = []
  page.on('response', async (response) => {
    if (response.url().includes('supabase') && response.status() >= 400) {
      try {
        const body = await response.text()
        errors.push(`${response.status()} ${response.url()}: ${body}`)
      } catch {}
    }
  })

  // Submit the form
  await page.keyboard.press('Enter')
  log('Submitted email form')

  // Wait for OTP screen or error
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'verify-4-after-submit.png' })

  const pageText = await page.innerText('body')
  log(`Page content after submit:\n${pageText.slice(0, 500)}`)

  if (errors.length > 0) {
    log(`ERRORS detected:\n${errors.join('\n')}`)
  } else {
    log('No HTTP errors from Supabase')
  }

  // Check if OTP input appeared
  const otpInput = page.locator('input[type="text"], input[inputmode="numeric"], input[maxlength="6"]')
  const otpVisible = await otpInput.count() > 0
  log(`OTP input visible: ${otpVisible}`)

  await page.screenshot({ path: 'verify-5-final.png' })

} catch (err) {
  log(`ERROR: ${err.message}`)
  await page.screenshot({ path: 'verify-error.png' }).catch(() => {})
} finally {
  await browser.close()
}
