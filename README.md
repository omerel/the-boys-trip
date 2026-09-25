# רשימת הציוד — Juliana Trail

אתר RTL מותאם לטלפון עבור עומר, עמרי ומתן, לקראת הטיול בסלובניה ב־7–13 באוקטובר 2026.

## מה יש באתר

- רשימה אישית לכל מטייל ורשימת ציוד משותף
- הוספה ומחיקה של קטגוריות ופריטים
- סימון פריטים שנארזו ומד התקדמות
- העתקת פריטים מרשימה של מטייל אחר
- שיוך ציוד משותף למי שמביא אותו
- סנכרון בזמן אמת בין שלושת הטלפונים באמצעות Cloud Firestore
- שמירה מקומית וגיבוי/שחזור בקובץ JSON

## חיבור חד־פעמי ל־Firebase — ללא תשלום

יש לבחור ולהישאר במסלול **Spark (No-cost)** בלבד. אין לחבר כרטיס אשראי או Billing account ואין לשדרג ל־Blaze. אם המכסה החינמית תיגמר, השירות ייעצר עד לחידוש המכסה במקום לחייב אתכם. האתר הזה משתמש רק ב־Google Authentication וב־Cloud Firestore — לא ב־Cloud Storage, Functions או SQL Connect.

המכסה החינמית של Firestore כוללת 50,000 קריאות ו־20,000 כתיבות ביום ו־1 GiB אחסון. עבור שלושה אנשים ורשימת ציוד קטנה, השימוש הצפוי נמוך בסדרי גודל מהמכסה. אין להכניס לאתר מידע רגיש.

1. היכנסו ל־[Firebase Console](https://console.firebase.google.com/) וצרו פרויקט חדש במסלול **Spark**. דלגו על Google Analytics אם מוצעת האפשרות.
2. במסך **Build → Authentication → Sign-in method**, הפעילו **Google** בלבד ובחרו כתובת תמיכה לפרויקט. אין צורך להפעיל Anonymous.
3. במסך **Build → Firestore Database**, צרו מסד נתונים.
4. פתחו את לשונית **Rules**, העתיקו אליה את תוכן הקובץ `firestore.rules` ולחצו **Publish**.
5. ב־**Project settings → Your apps**, הוסיפו Web app והעתיקו את ערכי `firebaseConfig` שקיבלתם.
6. פתחו את `firebase-config.js` והחליפו את ערכי `PASTE_...` בערכים שקיבלתם. אין צורך ב־Analytics.

מפתח ה־API שמופיע ב־`firebase-config.js` מיועד להופיע בקוד של אפליקציות Web ואינו סיסמת מנהל. ההגנה על הנתונים נעשית באמצעות Authentication ו־Firestore Rules.

## בדיקה מקומית

בגלל השימוש ב־JavaScript modules, יש להריץ שרת מקומי ולא לפתוח את `index.html` ישירות:

```bash
python3 -m http.server 8080 --directory juliana-checklist
```

לאחר מכן פתחו `http://localhost:8080` בשני חלונות דפדפן ובדקו ששינוי בחלון אחד מופיע בשני.

## פרסום ב־GitHub Pages

1. צרו repository חדש ב־GitHub והעלו אליו את **תוכן** התיקייה `juliana-checklist`.
2. ב־GitHub פתחו **Settings → Pages**.
3. תחת **Build and deployment**, בחרו **Deploy from a branch**.
4. בחרו branch בשם `main` ואת התיקייה `/ (root)`, ושמרו.
5. לאחר כדקה יופיע הקישור לאתר. פתחו אותו בכל אחד משלושת הטלפונים.

אם Firebase Authentication מציג שגיאת domain, הוסיפו את הדומיין `<username>.github.io` ברשימת **Authentication → Settings → Authorized domains**.

## הערת פרטיות

האתר מחייב כניסה עם Google, אך בהתאם לבחירה שלכם אינו מגביל את הגישה לשלוש כתובות מסוימות: כל מי שמקבל את הקישור ומתחבר עם Google יוכל לראות ולערוך. לכן אין לפרסם את הקישור בפומבי ואין להכניס לאתר מסמכים, פרטי תשלום או מידע אישי רגיש. אם תרצו בעתיד, אפשר להגביל את כללי Firestore לשלוש כתובות דוא״ל בלבד.
