import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const counter = (page: Page) => page.getByTestId('slide-counter');

/** A small 2-page PDF: page 1 is solid blue, page 2 solid orange. */
async function makePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const colors = [rgb(0.2, 0.4, 0.8), rgb(0.95, 0.55, 0.1)];
  colors.forEach((color, i) => {
    const page = pdf.addPage([960, 540]);
    page.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color });
    page.drawText(`Smoke test ${i + 1}`, { x: 60, y: 250, size: 56, font, color: rgb(1, 1, 1) });
  });
  return Buffer.from(await pdf.save());
}

test('app loads with the start screen', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/AirSlides/);
  await expect(page.getByRole('heading', { level: 1, name: 'AirSlides' })).toBeVisible();
  await expect(page.getByTestId('start-tutorial')).toBeVisible();
  await expect(page.getByTestId('open-pdf')).toBeVisible();
});

test('tutorial deck starts and the keyboard navigates it', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('start-tutorial').click();
  await expect(page.getByTestId('present')).toBeVisible();
  await expect(counter(page)).toHaveText('1 / 7');

  await page.keyboard.press('ArrowRight');
  await expect(counter(page)).toHaveText('2 / 7');
  await page.keyboard.press('PageDown');
  await expect(counter(page)).toHaveText('3 / 7');
  await page.keyboard.press('Space');
  await expect(counter(page)).toHaveText('4 / 7');
  await page.keyboard.press('ArrowLeft');
  await expect(counter(page)).toHaveText('3 / 7');
  await page.keyboard.press('PageUp');
  await expect(counter(page)).toHaveText('2 / 7');
  await page.keyboard.press('End');
  await expect(counter(page)).toHaveText('7 / 7');
  await expect(page.getByRole('heading', { name: 'Use your own slides' })).toBeVisible();
});

test('keyboard toggles blackout and the talk timer', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('start-tutorial').click();
  await expect(counter(page)).toHaveText('1 / 7');

  await page.keyboard.press('b');
  await expect(page.getByTestId('blackout')).toHaveClass(/\bon\b/);
  await page.keyboard.press('b');
  await expect(page.getByTestId('blackout')).not.toHaveClass(/\bon\b/);

  await expect(page.getByTestId('timer')).toBeHidden();
  await page.keyboard.press('t');
  await expect(page.getByTestId('timer')).toBeVisible();
  await expect(page.getByTestId('timer')).toHaveText(/^\d\d:\d\d$/);
});

test('a PDF opens and renders page 1, then page 2', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('pdf-input').setInputFiles({
    name: 'smoke.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdf(),
  });
  const page1 = page.locator(
    '[data-testid=slide-frame] canvas[data-page="1"][data-rendered="true"]',
  );
  await expect(page1).toBeVisible();
  await expect(counter(page)).toHaveText('1 / 2');

  // the canvas really contains page 1 (solid blue ≈ rgb(51, 102, 204))
  const [r, g, b] = await page1.evaluate((c: HTMLCanvasElement) =>
    Array.from(c.getContext('2d')!.getImageData(10, 10, 1, 1).data),
  );
  expect(Math.abs(r! - 51)).toBeLessThan(12);
  expect(Math.abs(g! - 102)).toBeLessThan(12);
  expect(Math.abs(b! - 204)).toBeLessThan(12);

  await page.keyboard.press('ArrowRight');
  await expect(counter(page)).toHaveText('2 / 2');
  await expect(
    page.locator('[data-testid=slide-frame] canvas[data-page="2"][data-rendered="true"]'),
  ).toBeVisible();
});

test('Playground shows the FPS readout', async ({ page }) => {
  await page.goto('./#/playground');
  await expect(page.getByRole('heading', { name: 'Live readouts' })).toBeVisible();
  await expect(page.getByTestId('fps')).toBeVisible();
  await expect(page.locator('.readout', { hasText: 'FPS' })).toBeVisible();
});

test('Help lists every gesture', async ({ page }) => {
  await page.goto('./#/help');
  for (const action of [
    'Next slide',
    'Previous slide',
    'Laser pointer',
    'Blackout on / off',
    'Start / pause timer',
    'Lock / unlock gestures',
  ]) {
    await expect(page.locator('.gesture-table').getByText(action, { exact: true })).toBeVisible();
  }
});
