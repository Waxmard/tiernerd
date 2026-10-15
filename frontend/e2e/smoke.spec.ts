import { expect, test } from '@playwright/test';

test('create list, add good item, delete the list', async ({ page }) => {
  const stamp = Date.now();
  const listTitle = `E2E ${stamp}`;
  const itemName = `Item ${stamp}`;

  await page.goto('/');
  await page.getByPlaceholder('name@example.com').fill('dev@tiernerd.com');
  await page.getByPlaceholder('••••••••').fill('devpassword');
  await page.getByText('Log In').click();
  await expect(page.getByTestId('fab-create')).toBeVisible();

  await page.getByTestId('fab-create').click();
  await expect(page.getByText('Create New List')).toBeVisible();
  await page.getByPlaceholder('Enter list title').fill(listTitle);
  await page.getByText('Create', { exact: true }).click();

  // HomeScreen chains a successful create straight into the add-item step.
  await expect(page.getByRole('heading', { name: 'Add item', exact: true })).toBeVisible();
  await page.getByPlaceholder('Enter item name').fill(itemName);
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();

  const row = page.getByTestId('ranked-item').filter({ hasText: itemName });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText('8.5', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();

  // Regression guard: react-native-web's Alert is a no-op stub, so the delete
  // confirmation must open a real browser dialog.
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });

  await page.getByTestId('delete-list').click();
  await expect.poll(() => dialogs.join('\n')).toContain('Delete List');
  await expect(page.getByTestId('fab-create')).toBeVisible();
  // HomeScreen refetches on focus, so the deleted card is gone without a reload.
  await expect(page.getByText(listTitle)).toHaveCount(0);

  // Reload proves the session persisted (AsyncStorage -> localStorage).
  await page.reload();
  await expect(page.getByTestId('fab-create')).toBeVisible();
  await expect(page.getByText(listTitle)).toHaveCount(0);
});
