
# Basen Morzkulc – Starter (React + Firebase)

To jest prosty starter aplikacji do zapisów na basen z logowaniem Google, odczytem terminów z Firestore, prostym zapisem na godziny oraz szkieletem Cloud Functions do egzekwowania zasad regulaminu.

## Kroki wdrożenia (skrót)
1. Zainstaluj Node.js LTS (https://nodejs.org).
2. Zainstaluj Firebase CLI: `npm i -g firebase-tools` i zaloguj się: `firebase login`.
3. W konsoli Firebase utwórz projekt, włącz Authentication (Google) i Firestore.
4. Skopiuj konfigurację Web App i wklej do `src/firebase.ts` w miejsce PLACEHOLDERA.
5. Ustaw reguły Firestore (plik `firestore.rules`).
6. Zainstaluj zależności: `npm install`.
7. Wybierz projekt: `firebase use --add`.
8. Uruchom lokalnie: `npm run dev`.
9. Zbuduj: `npm run build` i wdroż: `firebase deploy`.

Szczegółowe instrukcje masz w wiadomości na czacie ode mnie.
