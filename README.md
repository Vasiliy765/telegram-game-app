# telegram-game-app

## Firebase Firestore

Online rooms, persistent balances, and the balance leaderboard use Firebase
Anonymous Authentication and Cloud Firestore.

1. Enable **Authentication → Anonymous** and create a **Cloud Firestore** database
   in the Firebase project.
2. The Firebase web app settings are in `js/firebase-config.js`.
3. Publish `firestore.rules` as the Firestore security rules.
4. Serve the app over HTTPS (or localhost). Telegram profile display and quick
   games with bots work without Firebase; online rooms and saved balances require
   the configured project and deployed rules.

Firestore stores player profiles and balances in `players/{firebaseUid}`. Game
rooms are stored in the `durakRooms`, `tictactoeRooms`, and `battleshipRooms`
collections. Room IDs are shared through invitation links, and Firestore rules
require an authenticated player to read or update a room.
Mini App invitations use Telegram deep links in the form
`https://t.me/SecretAgentGame646Bot?startapp=room_<ROOM_ID>`.

Telegram `initDataUnsafe` fields are used for display only, not as authentication.
Each anonymous Firebase account keeps its own balance document; balances are
client-controlled in this demo, so a production competitive wallet needs a trusted
backend that verifies Telegram init data and owns balance updates. Room state is
also client-maintained by authenticated participants; production ranked games need
server-authoritative validation.

## Telegram bot

The server-side bot uses the same Firebase project through the private
`serviceAccountKey.json` file and stores Telegram profiles and balances in the
Firestore `users` collection.

1. Copy `.env.example` to `.env`, then set the bot token and HTTPS Mini App URL
   as `BOT_TOKEN` and `WEBAPP_URL`.
2. Keep `serviceAccountKey.json` in the project root; it is ignored by Git.
3. Install dependencies with `npm install`, then start the bot with `npm start`.
4. In Telegram groups, enable bot access to regular messages (disable privacy
   mode via BotFather) so the bot can see game invitations and text commands.
   Web App buttons work in private chats; the group `/start` button opens the
   same URL as a regular link button.

The bot supports `/start`, `/balance` or `Баланс`, `/top` or `Топ`, and group
invitations in the form `Зіграти в монетку <сума>` or
`Зіграти в кубика <сума>` (10–300 coins). User profiles in `users/{telegramId}`
include coin and diamond balances. `Баланс`, `Топ`, `Зп`/`Зарплата`,
`Магазин`/`Донат`, and the group game invitations work in chats. `Магазин` or
`Донат` creates Telegram Stars invoice links for the four diamond packages;
Mini App purchases use
`https://telegram-game-app.onrender.com/api/create-diamonds-invoice`.
The packages are 10/15, 50/65, 100/115, and 300/270 diamonds/Stars.

The invoice endpoint accepts requests only with valid, recent Telegram Mini App
`initData`, and its CORS origin is limited to the deployed Mini App. Successful
Stars payments are checked against the invoice record and credited once in
Firestore. Keep the Render bot service online with `BOT_TOKEN` and Firebase
service credentials configured. The admin can grant diamonds with
`Видати діаманти <Telegram ID> <кількість>` or by replying to a user's message
with `Видати діаманти <кількість>`.
