# Облік речей Феміністичної майстерні: GitHub + Cloudflare

Усе робиться в браузері, нічого встановлювати не треба.

## Крок 1. Залийте файли на GitHub

1. На github.com натисніть **New repository**. Назва: `richi-maisterni`. Оберіть **Private**.
2. На сторінці порожнього репозиторію натисніть **uploading an existing file**.
3. Перетягніть **вміст** теки `richi-maisterni-cloudflare`: теки `public` і `src` та файли `wrangler.jsonc`, `README.md`, `.gitignore`. Саму теку перетягувати не треба, інакше файли опиняться на рівень глибше.
4. Натисніть **Commit changes**.

Файл `.gitignore` прихований. Якщо система його не показує, можна пропустити, він не обов’язковий.

## Крок 2. Підключіть репозиторій до Cloudflare

1. На dash.cloudflare.com відкрийте **Workers & Pages → Create application**.
2. Біля **Import a repository** натисніть **Get started** і підключіть GitHub-акаунт.
3. Оберіть репозиторій `richi-maisterni`.
4. Назва проєкту має бути саме `richi-maisterni`, як у `wrangler.jsonc`, інакше збірка впаде. Команду для викладання лишіть `npx wrangler deploy`.
5. Натисніть **Save and Deploy**.

Базу даних Cloudflare створить сам, а таблицю застосунок створить під час першого запуску.

Наприкінці з’явиться адреса на кшталт `https://richi-maisterni.<щось>.workers.dev`. Сторінка покаже, що вхід не налаштований. Так і має бути: доки його немає, сервер нікому не віддає даних.

## Крок 3. Увімкніть вхід через Cloudflare Access

1. У Worker `richi-maisterni` відкрийте **Settings → Domains & Routes**.
2. Біля `workers.dev` натисніть **Enable Cloudflare Access**.
3. У віконці з’являться **AUD** (довгий код) і адреса команди виду `https://назва.cloudflareaccess.com`. Збережіть обидва.
4. Натисніть **Manage Cloudflare Access** і впишіть пошти людей із майстерні.

Якщо Zero Trust вмикаєте вперше, Cloudflare попросить вигадати назву команди й обрати тариф. Обирайте Free.

## Крок 4. Впишіть коди у файл на GitHub

1. У репозиторії відкрийте `wrangler.jsonc` і натисніть олівець (**Edit**).
2. Замініть `https://ВСТАВТЕ_НАЗВУ_КОМАНДИ.cloudflareaccess.com` на адресу команди, а `ВСТАВТЕ_AUD` на код AUD.
3. Натисніть **Commit changes**.

Cloudflare сам помітить зміну й перевикладе застосунок приблизно за хвилину.

## Крок 5. Перевірте

Відкрийте адресу в вікні інкогніто. Cloudflare попросить пошту й надішле код. Після входу відкриється облік.

## Потім знадобиться

**Змінити застосунок.** Будь-яка зміна у файлах на GitHub перевикладається сама.

**Додати чи прибрати людину.** Zero Trust → Access → Policies → політика `richi-maisterni - Production`.

**Якщо збірка впала на базі.** Створіть базу вручну: **Storage & databases → D1 → Create**, назва `richi-maisterni`. Потім скопіюйте її ID і допишіть у `wrangler.jsonc` під `"database_name"` рядок `"database_id": "ваш-id"` (не забудьте кому після попереднього рядка).
