"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelOrMoveBooking = exports.createBooking = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
const region = 'europe-central2';
function hoursBetween(a, b) {
    return (b.getTime() - a.getTime()) / (1000 * 60 * 60);
}
exports.createBooking = functions.region(region).https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Zaloguj się.');
    const { poolId, hour, type } = data;
    const poolRef = db.collection('pools').doc(poolId);
    const poolSnap = await poolRef.get();
    if (!poolSnap.exists)
        throw new functions.https.HttpsError('not-found', 'Nie ma takiego terminu.');
    const pool = poolSnap.data();
    const hourObj = (pool.hours || []).find((h) => h.label === hour);
    if (!hourObj)
        throw new functions.https.HttpsError('invalid-argument', 'Zła godzina.');
    const userDoc = await db.collection('users').doc(uid).get();
    const u = (userDoc.exists ? userDoc.data() : {});
    const userName = u?.displayName || u?.email || 'Uczestnik';
    let userPublicRole = 'Gość';
    if (u?.roles?.instructor)
        userPublicRole = 'Instruktor';
    else if (u?.roles?.organizer)
        userPublicRole = 'Organizator';
    else if (u?.roles?.admin)
        userPublicRole = 'Admin';
    else if (u?.membership?.skkMorzkulcPaid)
        userPublicRole = 'SKK (składka)';
    else if (u?.membership?.zabikrukPaid)
        userPublicRole = 'Żabi Kruk (składka)';
    else if (u?.membership?.jarmolowiczGroup)
        userPublicRole = 'Grupa MJ';
    const active = await db.collection('bookings')
        .where('poolId', '==', poolId).where('hour', '==', hour).where('status', '==', 'active').get();
    const capacity = hourObj.capacity || 12;
    if (active.size >= capacity) {
        await db.collection('waitlists').add({
            poolId, hour, uid, type: type || 'regular', createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { message: 'Dodano do listy oczekujących.' };
    }
    await db.collection('bookings').add({
        poolId, hour, uid, type: type || 'regular',
        date: pool.date,
        status: 'active',
        userName,
        userPublicRole,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { message: 'Rezerwacja aktywna.' };
});
exports.cancelOrMoveBooking = functions.region(region).https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Zaloguj się.');
    const { bookingId } = data;
    const ref = db.collection('bookings').doc(bookingId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new functions.https.HttpsError('not-found', 'Nie ma takiej rezerwacji.');
    const b = snap.data();
    if (b.uid !== uid)
        throw new functions.https.HttpsError('permission-denied', 'To nie jest Twoja rezerwacja.');
    await ref.update({ status: 'cancelled', cancelReason: 'user' });
    return { message: 'Anulowano (MVP – bez logiki 72h).' };
});
//# sourceMappingURL=index.js.map