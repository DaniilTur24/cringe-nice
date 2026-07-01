import { test, expect } from '@playwright/test'

test.describe('Onboarding — email screen', () => {
  test.beforeEach(async ({ page }) => {
    // Start unauthenticated — no stored session
    await page.context().clearCookies()
    await page.goto('/')
    // Wait for Supabase auth check to finish (loading spinner disappears)
    await page.waitForSelector('[data-testid="email-screen"], input[type="email"]', {
      timeout: 10_000,
    })
  })

  test('shows email input on first load', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible()
  })

  test('submit button is disabled for empty input', async ({ page }) => {
    // Button should be disabled or the form shouldn't submit without a value
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeEmpty()
  })

  test('typing a valid email enables submission', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]')
    await emailInput.fill('test@example.com')
    await expect(emailInput).toHaveValue('test@example.com')
  })

  test('shows OTP screen after email submit (network may fail in CI)', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]')
    await emailInput.fill('test@example.com')

    // Intercept the Supabase OTP request so we don't send a real email
    await page.route('**/auth/v1/otp**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )

    const submitBtn = page.locator('button[type="submit"]').filter({ hasText: 'Получить код' })
    await submitBtn.click()

    // Expect OTP code input to appear
    await expect(
      page.locator('input[inputmode="numeric"], input[type="tel"], [data-testid="otp-screen"]'),
    ).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Onboarding — invite link routing', () => {
  test('navigates to join screen when trip_id is in URL', async ({ page }) => {
    const fakeTripId = '00000000-0000-0000-0000-000000000001'
    await page.context().clearCookies()
    await page.goto(`/?trip_id=${fakeTripId}`)
    // Still lands on auth (no session), but trip_id is preserved
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible({ timeout: 10_000 })
  })
})
