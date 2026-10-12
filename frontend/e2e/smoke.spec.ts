import { expect, test } from '@playwright/test';

test('create list, add great item, delete the list', async ({ page }) => {
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
  await expect(page.getByText('Add Item')).toBeVisible();
  await page.getByPlaceholder('Enter item name').fill(itemName);
  await page.getByText('Great (7–10)').click();
  await page.getByText('Add', { exact: true }).click();

  const row = page.getByTestId('ranked-item').filter({ hasText: itemName });
  await expect(row).toContainText('8.5');

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
