import assert from 'node:assert/strict';

const host = (name, fallback) => {
  const value = process.env[name] || fallback;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(value)) throw new Error(`Refusing nonlocal ${name}: ${value}`);
  return value;
};
const authHost = host('BROWSER_AUTH_EMULATOR_HOST', '127.0.0.1:9110');
const firestoreHost = host('BROWSER_FIRESTORE_EMULATOR_HOST', '127.0.0.1:8182');
const email = process.env.BROWSER_TEST_EMAIL || 'browser-owner@validation.example';
const password = process.env.BROWSER_TEST_PASSWORD || 'EmulatorTestOnly123!';

async function auth(path, body) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${path}?key=demo-key`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  });
  return {status: response.status, body: await response.json()};
}

let result = await auth('signUp', {email, password, returnSecureToken: true});
if (result.status !== 200) result = await auth('signInWithPassword', {email, password, returnSecureToken: true});
assert.equal(result.status, 200, JSON.stringify(result.body));
const account = result.body;
const profilePath = `RC-FormWork-App/root/users/${email}`;
const fields = {
  uid: {stringValue: account.localId}, email: {stringValue: email}, firstName: {stringValue: 'Browser'},
  lastName: {stringValue: 'Acceptance'}, position: {stringValue: 'Engineer'}, department: {stringValue: 'Test'},
  role: {arrayValue: {values: [{stringValue: 'MasterAdmin'}]}}, status: {stringValue: 'approved'},
  assignedProjects: {arrayValue: {values: []}}, projectPermissions: {mapValue: {fields: {}}},
  createdAt: {timestampValue: '2023-11-14T22:13:20.000Z'}, photoURL: {stringValue: ''}, isFirstUser: {booleanValue: false},
};
const profile = await fetch(`http://${firestoreHost}/v1/projects/demo-cmg-formwork/databases/(default)/documents/${profilePath}`, {
  method: 'PATCH', headers: {'Content-Type': 'application/json', Authorization: 'Bearer owner'}, body: JSON.stringify({fields}),
});
assert.equal(profile.status, 200, await profile.text());
console.log(JSON.stringify({email, password, localId: account.localId, status: 'PASS', scope: 'demo emulator only'}));
