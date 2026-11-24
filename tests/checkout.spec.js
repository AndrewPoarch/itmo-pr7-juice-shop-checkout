const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');

const product = 'Apple Juice (1000ml)';
const recipient = 'Workshop Tester';
const deliveryCity = 'Sample City';
const cardNumber = '4111111111111111'; // Учебный номер для локального симулятора.

const button = (page, name) => page.getByRole('button', { name, exact: true });
const textbox = (page, name) => page.getByRole('textbox', { name, exact: true });
const rowWith = (page, text) => page.getByRole('row').filter({ hasText: text });

async function registerAndLogIn(page) {
  const email = `workshop-${randomUUID()}@example.test`;
  const password = 'Local-workshop-73!';

  await page.goto('/#/register');
  await button(page, 'Close Welcome Banner').click();
  await button(page, 'dismiss cookie message').click();

  await textbox(page, 'Email address field').fill(email);
  await textbox(page, 'Field for the password').fill(password);
  await textbox(page, 'Field to confirm the password').fill(password);
  await page.getByRole('combobox', { name: 'Selection list for the security question' }).click();
  await page.getByRole('option', { name: 'Your favorite book?' }).click();
  await textbox(page, 'Field for the answer to the security question').fill('Workshop Sample');
  await button(page, 'Button to complete the registration').click();

  await textbox(page, 'Text field for the login email').fill(email);
  await textbox(page, 'Text field for the login password').fill(password);
  await button(page, 'Login').click();
  await expect(page.getByText('All Products', { exact: true })).toBeVisible();
}

async function openBasketWithProduct(page) {
  const productCard = page.getByRole('article').filter({ hasText: product });
  await productCard.getByRole('button', { name: 'Add to Basket' }).click();
  await expect(page.getByText(`Placed ${product} into basket.`, { exact: true })).toBeVisible();
  await button(page, 'Show the shopping cart').click();
  await expect(rowWith(page, product)).toBeVisible();
}

async function openCheckout(page) {
  await openBasketWithProduct(page);
  await button(page, 'Checkout').click();
  await expect(page.getByRole('heading', { name: 'Select an address' })).toBeVisible();
}

async function fillAddress(page) {
  await button(page, 'Add New Address').click();
  await textbox(page, 'Name').fill(recipient);
  await textbox(page, 'Country').fill('United States');
  await page.getByRole('spinbutton', { name: 'Mobile Number' }).fill('2025550147');
  await textbox(page, 'ZIP Code').fill('00000');
  await textbox(page, 'Address').fill('1 Example Street');
}

async function saveAddress(page) {
  await textbox(page, 'City').fill(deliveryCity);
  await button(page, 'Submit').click();
  await expect(rowWith(page, deliveryCity)).toBeVisible();
}

async function chooseAddress(page) {
  await rowWith(page, deliveryCity).getByRole('radio').check();
  await button(page, 'Continue').click();
  await expect(page.getByRole('heading', { name: 'Choose a delivery speed' })).toBeVisible();
}

async function openDelivery(page) {
  await openCheckout(page);
  await fillAddress(page);
  await saveAddress(page);
  await chooseAddress(page);
}

async function chooseDelivery(page, method) {
  await rowWith(page, method).getByRole('radio').check();
  await button(page, 'Proceed to delivery method selection').click();
  await expect(page.getByRole('heading', { name: 'My Payment Options' })).toBeVisible();
}

async function chooseCard(page) {
  const addCard = button(page, 'Add new card Add a credit or debit card');
  await addCard.click();
  await textbox(page, 'Name').fill(recipient);
  await page.getByRole('spinbutton', { name: 'Card Number' }).fill(cardNumber);
  await page.getByRole('combobox', { name: 'Expiry Month' }).selectOption({ label: '12' });
  await page.getByRole('combobox', { name: 'Expiry Year' }).selectOption({ label: '2089' });
  await button(page, 'Submit').click();

  const savedCard = rowWith(page, /1111.*Workshop Tester/);
  await expect(savedCard).toBeVisible();
  await addCard.click();
  await savedCard.getByRole('radio').check();
}

test.beforeEach(async ({ page }) => {
  await test.step('Создать отдельного пользователя и войти в магазин', async () => {
    await registerAndLogIn(page);
  });
});

test.describe('Корзина и адрес', () => {
  test('ORD-01. Из пустой корзины нельзя начать оформление', async ({ page }) => {
    await button(page, 'Show the shopping cart').click();
    await expect(page.getByRole('heading', { name: /Your Basket/ })).toBeVisible();
    await expect(rowWith(page, product)).toHaveCount(0);
    await expect(button(page, 'Checkout')).toBeDisabled();
  });

  test('ORD-02. Без адреса и обязательного города нельзя продолжить', async ({ page }) => {
    await openCheckout(page);
    await expect(button(page, 'Continue')).toBeDisabled();
    await fillAddress(page);
    await expect(button(page, 'Submit')).toBeDisabled();
    await saveAddress(page);
    await expect(button(page, 'Continue')).toBeDisabled();
    await chooseAddress(page);
    await expect(page.getByText(deliveryCity, { exact: false })).toBeVisible();
  });
});

test.describe('Доставка и оплата', () => {
  test('ORD-03. Доставка обязательна, стандартная не увеличивает цену', async ({ page }) => {
    await openDelivery(page);
    await expect(button(page, 'Proceed to delivery method selection')).toBeDisabled();
    await expect(rowWith(page, 'Standard Delivery')).toContainText('0.00¤');
    await chooseDelivery(page, 'Standard Delivery');
    await expect(button(page, 'Pay 1.99¤')).toBeVisible();
  });

  test('ORD-04. Без выбранной карты и при пустом кошельке нельзя продолжить', async ({ page }) => {
    await openDelivery(page);
    await chooseDelivery(page, 'Standard Delivery');
    await expect(page.getByText('Wallet Balance 0.00', { exact: true })).toBeVisible();
    await expect(button(page, 'Pay 1.99¤')).toBeDisabled();
    await expect(button(page, 'Proceed to review')).toBeDisabled();

    await chooseCard(page);
    await expect(button(page, 'Proceed to review')).toBeEnabled();
  });
});

test.describe('Подтверждение заказа', () => {
  test('ORD-05. Сводка показывает товар, адрес, карту и 2.98¤ с экспресс-доставкой', async ({ page }) => {
    await openDelivery(page);
    await expect(rowWith(page, 'One Day Delivery')).toContainText('0.99¤');
    await chooseDelivery(page, 'One Day Delivery');
    await chooseCard(page);
    await button(page, 'Proceed to review').click();

    await expect(page.getByText('Order Summary', { exact: true })).toBeVisible();
    await expect(rowWith(page, product)).toContainText('1.99¤');
    await expect(page.getByText(deliveryCity, { exact: false })).toBeVisible();
    await expect(page.getByText('Card ending in 1111', { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /^Delivery 0\.99¤$/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /^Total Price 2\.98¤$/ })).toBeVisible();
  });

  test('ORD-06. Заказ подтверждается, корзина очищается, товар виден в отслеживании', async ({ page }, testInfo) => {
    await test.step('Заполнить данные доставки и оплаты', async () => {
      await openDelivery(page);
      await chooseDelivery(page, 'One Day Delivery');
      await chooseCard(page);
      await button(page, 'Proceed to review').click();
      await expect(page.getByRole('row', { name: /^Total Price 2\.98¤$/ })).toBeVisible();
    });

    await test.step('Подтвердить заказ в симуляторе', async () => {
      await button(page, 'Complete your purchase').click();
      await expect(page.getByRole('heading', { name: 'Thank you for your purchase!' })).toBeVisible();
      await expect(button(page, 'Show the shopping cart')).toHaveText(/0\s*$/);
      await testInfo.attach('Подтверждение заказа', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    });

    await test.step('Открыть отслеживание и проверить товар', async () => {
      const trackOrder = page.getByRole('link', { name: 'Track Orders' });
      await expect(trackOrder).toHaveAttribute('href', /[?&]id=[^&]+/);
      await trackOrder.click();
      await expect(page.getByRole('heading', { name: /Search Results - .+/ })).toBeVisible();
      await expect(rowWith(page, product)).toContainText('1.99¤');
    });
  });
});
