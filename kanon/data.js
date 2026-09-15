/* KANON — exercise library, substitution graph, constants.
 * Video links are YouTube SEARCH deep links on purpose: a fabricated video ID
 * is a dead or wrong link, a search query is always valid and always relevant.
 * jointLoad: 0 = negligible, 1 = moderate, 2 = high. Used to pick substitutes
 * that keep the muscle and drop the joint.
 */
const VID = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q + ' proper form');

const SLOTS = [
  { id: 'squat',  name: 'Squat / quad',      muscles: ['quads', 'glutes'] },
  { id: 'hpress', name: 'Horizontal press',  muscles: ['chest', 'triceps', 'frontdelt'] },
  { id: 'vpull',  name: 'Vertical pull',     muscles: ['lats', 'biceps'] },
  { id: 'hinge',  name: 'Hinge / ham-glute', muscles: ['hams', 'glutes'] },
  { id: 'hpull',  name: 'Horizontal pull',   muscles: ['midback', 'reardelt', 'biceps'] },
  { id: 'vpress', name: 'Vertical press',    muscles: ['sidedelt', 'frontdelt', 'triceps'] }
];

const EX = [
  // ---- SQUAT / QUAD ----
  { id:'legpress',    slot:'squat',  name:'Leg press',                 inc:10, joints:{knee:1,lowback:0,hip:1,shoulder:0,elbow:0},
    cue:'Feet mid-platform. Stop before the low back rounds off the pad. Do not lock out hard.' },
  { id:'gobletsq',    slot:'squat',  name:'Goblet squat',              inc:5,  joints:{knee:1,lowback:1,hip:1,shoulder:0,elbow:0},
    cue:'Elbows inside the knees at the bottom. Chest tall. Full depth only if it stays painless.' },
  { id:'sbsquat',     slot:'squat',  name:'Safety-bar squat',          inc:10, joints:{knee:2,lowback:2,hip:1,shoulder:0,elbow:0},
    cue:'Brace before you unrack. Sit between the hips, not back onto the heels.' },
  { id:'hacksquat',   slot:'squat',  name:'Hack squat',                inc:10, joints:{knee:2,lowback:1,hip:1,shoulder:0,elbow:0},
    cue:'Feet slightly forward keeps the knees happier. Control the descent.' },
  { id:'smithsq',     slot:'squat',  name:'Smith machine squat',       inc:10, joints:{knee:1,lowback:1,hip:1,shoulder:0,elbow:0},
    cue:'Feet a few inches forward of the bar path. The machine holds the balance, you hold the tension.' },
  { id:'beltsq',      slot:'squat',  name:'Belt squat',                inc:10, joints:{knee:1,lowback:0,hip:1,shoulder:0,elbow:0},
    cue:'Zero spinal load. The default when the low back is the complaint, not the knee.' },
  { id:'revlunge',    slot:'squat',  name:'Reverse lunge',             inc:5,  joints:{knee:1,lowback:0,hip:1,shoulder:0,elbow:0},
    cue:'Step back, not forward. Short stride loads the quad, long stride loads the glute.' },

  // ---- HORIZONTAL PRESS ----
  { id:'machchest',   slot:'hpress', name:'Machine chest press',       inc:10, joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Set the seat so the handles line up with mid-chest. Stop just short of the shoulders rolling forward.' },
  { id:'dbbench',     slot:'hpress', name:'Dumbbell bench press',      inc:5,  joints:{shoulder:2,elbow:1,wrist:1},
    cue:'Elbows about 45 degrees from the torso, not flared to 90. Stop an inch above the chest.' },
  { id:'dbbenchneut', slot:'hpress', name:'Neutral-grip DB press',     inc:5,  joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Palms facing each other. This is the shoulder-friendly press. Go here first when the shoulder talks.' },
  { id:'inclinemach', slot:'hpress', name:'Incline machine press',     inc:10, joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Roughly 30 degrees. Higher than that turns it into a shoulder press.' },
  { id:'inclinedb',   slot:'hpress', name:'Incline dumbbell press',    inc:5,  joints:{shoulder:2,elbow:1,wrist:1},
    cue:'30 degrees. Let the dumbbells drift slightly together at the top without clanging.' },
  { id:'pecdeck',     slot:'hpress', name:'Pec deck / cable fly',      inc:10, joints:{shoulder:1,elbow:0,wrist:0},
    cue:'Soft elbow angle held constant. This is a chest movement, not a press.' },
  { id:'pushup',      slot:'hpress', name:'Push-up (weighted)',        inc:5,  joints:{shoulder:1,elbow:1,wrist:2},
    cue:'Ribs down, glutes on. Elevate the hands if the wrist or shoulder complains.' },

  // ---- VERTICAL PULL ----
  { id:'latpulln',    slot:'vpull',  name:'Neutral-grip lat pulldown', inc:10, joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Pull the elbows down and back, not the hands. Stop at the collarbone.' },
  { id:'latpullw',    slot:'vpull',  name:'Wide-grip lat pulldown',    inc:10, joints:{shoulder:2,elbow:1,wrist:0},
    cue:'Slight lean back, chest up. Do not yank with the low back.' },
  { id:'assistpull',  slot:'vpull',  name:'Assisted pull-up',          inc:5,  joints:{shoulder:2,elbow:2,wrist:1},
    cue:'Full hang but controlled. Neutral grip is easier on the elbow than pronated.' },
  { id:'machpull',    slot:'vpull',  name:'Machine pulldown',          inc:10, joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Chest against the pad. Let the machine hold you so the lat does the work.' },
  { id:'strarm',      slot:'vpull',  name:'Straight-arm pulldown',     inc:10, joints:{shoulder:1,elbow:0,wrist:0},
    cue:'Elbow angle locked. Pure lat, no biceps. Good when the elbow is the problem.' },

  // ---- HINGE / HAM-GLUTE ----
  { id:'rdl',         slot:'hinge',  name:'Romanian deadlift',         inc:10, joints:{lowback:2,hip:1,knee:0},
    cue:'Push the hips back, bar stays against the legs. Stop where the back would round, not where the hands land.' },
  { id:'backext',     slot:'hinge',  name:'45-degree back extension',  inc:5,  joints:{lowback:1,hip:1,knee:0},
    cue:'Round or flat, pick one and own it. Squeeze the glutes at the top, do not hyperextend.' },
  { id:'legcurl',     slot:'hinge',  name:'Seated leg curl',           inc:10, joints:{lowback:0,hip:0,knee:1},
    cue:'Zero spinal load. The default hinge substitute when the low back is cranky.' },
  { id:'liecurl',     slot:'hinge',  name:'Lying leg curl',            inc:10, joints:{lowback:1,hip:0,knee:1},
    cue:'Hips stay down on the pad. If they lift, the weight is too heavy.' },
  { id:'pullthru',    slot:'hinge',  name:'Cable pull-through',        inc:10, joints:{lowback:1,hip:1,knee:0},
    cue:'Hinge, do not squat. The cable does the pulling, you do the hinging.' },
  { id:'trapbar',     slot:'hinge',  name:'Trap-bar deadlift',         inc:10, joints:{lowback:2,hip:2,knee:1},
    cue:'More upright than a conventional pull. Set the back before the bar leaves the floor.' },
  { id:'glutebridge', slot:'hinge',  name:'Machine glute bridge',      inc:10, joints:{lowback:1,hip:1,knee:0},
    cue:'Chin tucked, ribs down. Pause at the top.' },

  // ---- HORIZONTAL PULL ----
  { id:'csrow',       slot:'hpull',  name:'Chest-supported row',       inc:10, joints:{lowback:0,shoulder:1,elbow:1},
    cue:'Chest stays on the pad the whole set. Elbows to the hips for lats, to the ribs for mid-back.' },
  { id:'machrow',     slot:'hpull',  name:'Machine row',               inc:10, joints:{lowback:0,shoulder:1,elbow:1},
    cue:'Pull to the torso, pause, control back. Do not let the shoulders roll forward at the stretch.' },
  { id:'cablerow',    slot:'hpull',  name:'Seated cable row',          inc:10, joints:{lowback:1,shoulder:1,elbow:1},
    cue:'Torso near vertical. A small lean is fine, a rowing-machine heave is not.' },
  { id:'dbrow',       slot:'hpull',  name:'One-arm dumbbell row',      inc:5,  joints:{lowback:1,shoulder:1,elbow:1},
    cue:'Brace the free hand. Pull to the hip, not the armpit.' },
  { id:'facepull',    slot:'hpull',  name:'Face pull',                 inc:5,  joints:{lowback:0,shoulder:1,elbow:0},
    cue:'High elbows, pull to the forehead. Rear delt and upper back, light weight, high reps.' },

  // ---- VERTICAL PRESS ----
  { id:'machshld',    slot:'vpress', name:'Machine shoulder press',    inc:10, joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Back flat on the pad. Stop just short of lockout.' },
  { id:'dbshld',      slot:'vpress', name:'Seated DB shoulder press',  inc:5,  joints:{shoulder:2,elbow:1,wrist:1},
    cue:'Neutral or slightly angled grip. Do not force a straight-bar path if the shoulder objects.' },
  { id:'latraise',    slot:'vpress', name:'Lateral raise',             inc:5,  joints:{shoulder:1,elbow:0,wrist:0},
    cue:'Lead with the elbow, stop at shoulder height. Light weight, no swing. Best low-joint delt option.' },
  { id:'cablelat',    slot:'vpress', name:'Cable lateral raise',       inc:5,  joints:{shoulder:1,elbow:0,wrist:0},
    cue:'Constant tension through the whole range. One arm at a time.' },
  { id:'landmine',    slot:'vpress', name:'Landmine press',            inc:5,  joints:{shoulder:1,elbow:1,wrist:0},
    cue:'The angled path is the point. This is the overhead press for shoulders that hate overhead.' }
];

/* Substitution preference order per slot: earlier = lower joint cost.
 * The engine picks the first option that is not quarantined and that reduces
 * load on the specific joint the user flagged. */
const SUBS = {
  squat:  ['beltsq','legpress','smithsq','gobletsq','revlunge','hacksquat','sbsquat'],
  hpress: ['machchest','dbbenchneut','inclinemach','pecdeck','inclinedb','dbbench','pushup'],
  vpull:  ['machpull','latpulln','strarm','latpullw','assistpull'],
  hinge:  ['legcurl','backext','glutebridge','liecurl','pullthru','rdl','trapbar'],
  hpull:  ['csrow','machrow','cablerow','facepull','dbrow'],
  vpress: ['latraise','cablelat','machshld','landmine','dbshld']
};

const JOINTS = ['shoulder','elbow','wrist','lowback','hip','knee'];

EX.forEach(e => { e.video = VID(e.name); });
const byId = id => EX.find(e => e.id === id);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EX, SUBS, SLOTS, JOINTS, byId };
}
