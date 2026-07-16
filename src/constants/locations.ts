/** Location matching for the base filter and the location score. Lowercase substring matching. */

/** My preferred commute cities (CLAUDE.md). A location hit here earns the location bonus. */
export const COMMUTE_ZONE = [
  "ra'anana",
  'raanana',
  'hod hasharon',
  'hod ha-sharon',
  'herzliya',
  'herzeliya',
  'netanya',
  'petah tikva',
  'petach tikva',
  'petah tiqwa',
  'rosh haayin',
  "rosh ha'ayin",
  'rosh ha-ayin',
  'ramat gan',
  'tel aviv',
  'tel-aviv',
  'kfar saba',
  'kefar sava',
];

/** Broader Israel signal: any of these => the role is in Israel even if not in my commute zone. */
export const ISRAEL_CITIES = [
  ...COMMUTE_ZONE,
  'israel',
  'jerusalem',
  'haifa',
  'beer sheva',
  "be'er sheva",
  'beersheba',
  'yokneam',
  'yoqneam',
  'caesarea',
  'or yehuda',
  'airport city',
  'rehovot',
  'ness ziona',
  'nes ziona',
  'modiin',
  "modi'in",
  'givatayim',
  'holon',
  'bnei brak',
  'rishon',
];

/** ISO country codes that mean Israel (Lever exposes `country`). */
export const ISRAEL_COUNTRY_CODES = ['il'];

/** Words that mark a role as remote (used with location text). */
export const REMOTE_HINTS = ['remote', 'anywhere', 'work from home', 'wfh', 'distributed'];
