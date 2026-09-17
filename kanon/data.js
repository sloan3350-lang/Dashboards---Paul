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

/* ---- expanded library: big-box gym (Crunch Sunrise has all of this) ----
 * equip tags let the generator respect what is actually available, and let a
 * busy floor be worked around: 'machine' and 'cable' options are plentiful,
 * 'rack' and 'bar' are the ones with queues at 6pm. */
const EX2 = [
  // squat / quad
  { id:'pendulum',  slot:'squat',  name:'Pendulum / V-squat',       inc:10, equip:'machine', joints:{knee:1,lowback:0,hip:1},
    cue:'Back supported the whole way. Heavy quad work with almost nothing asked of the spine.' },
  { id:'legext',    slot:'squat',  name:'Leg extension',            inc:10, equip:'machine', joints:{knee:1,lowback:0,hip:0},
    cue:'Pure quad, no hip. Pause at the top rather than swinging up to it.' },
  { id:'bulgarian', slot:'squat',  name:'Bulgarian split squat',    inc:5,  equip:'db',      joints:{knee:2,lowback:1,hip:2},
    cue:'Rear foot elevated, weight through the front heel. Brutal at light loads, which is the point.' },
  { id:'stepup',    slot:'squat',  name:'Step-up',                  inc:5,  equip:'db',      joints:{knee:1,lowback:0,hip:1},
    cue:'Drive through the top foot. Do not push off the floor with the trailing leg.' },
  { id:'frontsq',   slot:'squat',  name:'Front squat',              inc:10, equip:'rack',    joints:{knee:2,lowback:1,hip:1},
    cue:'Elbows high. The bar rolls forward the moment they drop.' },
  { id:'sissysq',   slot:'squat',  name:'Sissy squat',              inc:5,  equip:'bw',      joints:{knee:2,lowback:0,hip:0},
    cue:'Knees travel forward, hips stay extended. Hard on the knee, so only if it is quiet.' },

  // horizontal press
  { id:'bbbench',   slot:'hpress', name:'Barbell bench press',      inc:5,  equip:'rack',    joints:{shoulder:2,elbow:1,wrist:1},
    cue:'Shoulder blades pinned down and back. Touch the lower chest, not the throat.' },
  { id:'smithbench',slot:'hpress', name:'Smith machine bench',      inc:10, equip:'machine', joints:{shoulder:1,elbow:1,wrist:1},
    cue:'Fixed path, so you can push closer to failure safely on your own.' },
  { id:'hammerchest',slot:'hpress',name:'Hammer Strength chest press',inc:10,equip:'machine',joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Independent arms, so the strong side cannot carry the weak one.' },
  { id:'dips',      slot:'hpress', name:'Dip (chest-biased)',       inc:5,  equip:'bw',      joints:{shoulder:2,elbow:2,wrist:1},
    cue:'Lean forward to bias the chest. Stop at upper arm parallel, not deeper.' },
  { id:'declinepress',slot:'hpress',name:'Decline press',           inc:10, equip:'machine', joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Often the friendliest press angle for a cranky shoulder.' },

  // vertical pull
  { id:'pullup',    slot:'vpull',  name:'Pull-up',                  inc:5,  equip:'bw',      joints:{shoulder:2,elbow:2,wrist:1},
    cue:'Full hang to chin over the bar. Add weight before adding reps past twelve.' },
  { id:'chinup',    slot:'vpull',  name:'Chin-up',                  inc:5,  equip:'bw',      joints:{shoulder:1,elbow:2,wrist:1},
    cue:'Supinated grip. More biceps, usually easier on the shoulder than a wide pull-up.' },
  { id:'hammerpull',slot:'vpull',  name:'Hammer Strength pulldown', inc:10, equip:'machine', joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Chest pad takes the torso out of it. Just pull the elbow to the hip.' },
  { id:'uniPull',   slot:'vpull',  name:'Single-arm cable pulldown',inc:5,  equip:'cable',   joints:{shoulder:1,elbow:1,wrist:0},
    cue:'One side at a time, full stretch overhead. Good for evening out a lopsided back.' },

  // hinge / ham-glute
  { id:'ghr',       slot:'hinge',  name:'Glute-ham raise',          inc:5,  equip:'machine', joints:{lowback:1,hip:1,knee:2},
    cue:'Lower under control as far as you can hold, then pull back. Hamstrings at long length.' },
  { id:'hipthrust', slot:'hinge',  name:'Barbell hip thrust',       inc:10, equip:'bar',     joints:{lowback:1,hip:1,knee:0},
    cue:'Chin tucked, ribs down, pause at lockout. Glutes without loading the spine.' },
  { id:'goodmorning',slot:'hinge', name:'Good morning',             inc:5,  equip:'rack',    joints:{lowback:2,hip:2,knee:0},
    cue:'Light. This is a hamstring and low-back movement that punishes ego.' },
  { id:'convdl',    slot:'hinge',  name:'Conventional deadlift',    inc:10, equip:'bar',     joints:{lowback:2,hip:2,knee:1},
    cue:'Set the lats before the bar moves. The most fatiguing lift in the building, so do not stack it.' },
  { id:'nordic',    slot:'hinge',  name:'Nordic curl',              inc:5,  equip:'bw',      joints:{lowback:0,hip:0,knee:2},
    cue:'Lower as slowly as you can control. Strongest known protection against a hamstring strain.' },

  // horizontal pull
  { id:'tbar',      slot:'hpull',  name:'T-bar row',                inc:10, equip:'bar',     joints:{lowback:2,shoulder:1,elbow:1},
    cue:'Chest up, hinge held. Heavy mid-back work if the low back is happy.' },
  { id:'hammerrow', slot:'hpull',  name:'Hammer Strength row',      inc:10, equip:'machine', joints:{lowback:0,shoulder:1,elbow:1},
    cue:'Chest supported, one arm at a time if you want the stretch.' },
  { id:'pendlay',   slot:'hpull',  name:'Pendlay row',              inc:10, equip:'bar',     joints:{lowback:2,shoulder:1,elbow:1},
    cue:'Dead stop on the floor each rep. Strict, no body english.' },
  { id:'invrow',    slot:'hpull',  name:'Inverted row',             inc:5,  equip:'bw',      joints:{lowback:0,shoulder:1,elbow:1},
    cue:'Body in one line. Raise the bar to make it easier, lower it to make it harder.' },
  { id:'revfly',    slot:'hpull',  name:'Reverse pec deck',         inc:5,  equip:'machine', joints:{lowback:0,shoulder:1,elbow:0},
    cue:'Rear delts. Light, high reps, no shrugging.' },

  // vertical press
  { id:'ohp',       slot:'vpress', name:'Standing overhead press',  inc:5,  equip:'rack',    joints:{shoulder:2,elbow:1,wrist:1},
    cue:'Squeeze the glutes so the press does not become a standing incline.' },
  { id:'smithshld', slot:'vpress', name:'Smith machine shoulder press',inc:10,equip:'machine',joints:{shoulder:1,elbow:1,wrist:0},
    cue:'Fixed path overhead. Useful when the stabilisers give out before the delts.' },
  { id:'arnold',    slot:'vpress', name:'Arnold press',             inc:5,  equip:'db',      joints:{shoulder:2,elbow:1,wrist:1},
    cue:'Rotate as you press. Skip it if the shoulder dislikes the bottom position.' },
  { id:'machlat',   slot:'vpress', name:'Machine lateral raise',    inc:5,  equip:'machine', joints:{shoulder:1,elbow:0,wrist:0},
    cue:'Pad against the upper arm. Constant tension, no momentum available.' },
  { id:'uprow',     slot:'vpress', name:'Cable upright row',        inc:5,  equip:'cable',   joints:{shoulder:2,elbow:1,wrist:1},
    cue:'Wide grip, stop at chest height. Drop it if the shoulder pinches at the top.' },

  // arms
  { id:'ezcurl',    slot:'arms',   name:'EZ-bar curl',              inc:5,  equip:'bar',     joints:{elbow:1,wrist:1,shoulder:0},
    cue:'Elbows pinned to the ribs. The angled grip is kinder to the wrist than a straight bar.' },
  { id:'inclinecurl',slot:'arms',  name:'Incline dumbbell curl',    inc:5,  equip:'db',      joints:{elbow:1,wrist:0,shoulder:1},
    cue:'Arms behind the body puts the long head at full stretch. Light weight.' },
  { id:'hammercurl',slot:'arms',   name:'Hammer curl',              inc:5,  equip:'db',      joints:{elbow:1,wrist:0,shoulder:0},
    cue:'Neutral grip. Brachialis and forearm, easiest curl on a sore elbow.' },
  { id:'pushdown',  slot:'arms',   name:'Cable pushdown',           inc:5,  equip:'cable',   joints:{elbow:1,wrist:0,shoulder:0},
    cue:'Elbows still. Only the forearm moves.' },
  { id:'ohext',     slot:'arms',   name:'Overhead cable extension', inc:5,  equip:'cable',   joints:{elbow:2,wrist:0,shoulder:1},
    cue:'Long head at stretch. Back off if the elbow complains at the bottom.' },
  { id:'skullcrush',slot:'arms',   name:'Skull crusher',            inc:5,  equip:'bar',     joints:{elbow:2,wrist:1,shoulder:0},
    cue:'Lower behind the forehead, not to it. Notorious for elbows, so keep it light.' },

  // calves / core
  { id:'calfstand', slot:'calves', name:'Standing calf raise',      inc:10, equip:'machine', joints:{knee:0,hip:0,lowback:0},
    cue:'Full stretch at the bottom, pause at the top. The stretch is where the growth is.' },
  { id:'calfseat',  slot:'calves', name:'Seated calf raise',        inc:10, equip:'machine', joints:{knee:1,hip:0,lowback:0},
    cue:'Bent knee biases the soleus. Slow, and do not bounce.' },
  { id:'abwheel',   slot:'core',   name:'Ab wheel rollout',         inc:5,  equip:'bw',      joints:{lowback:1,shoulder:1,hip:0},
    cue:'Ribs down, do not let the low back sag. Shorten the range before you lose the brace.' },
  { id:'cablecrunch',slot:'core',  name:'Cable crunch',             inc:10, equip:'cable',   joints:{lowback:1,shoulder:0,hip:0},
    cue:'Flex the spine against the load. Hips stay put.' },
  { id:'hanglegraise',slot:'core', name:'Hanging leg raise',        inc:5,  equip:'bw',      joints:{lowback:1,shoulder:1,hip:1},
    cue:'Curl the pelvis up rather than just swinging the legs.' }
];

/* ============================================================
   EX3 — free weights, and arms split out of the single "arms" slot.
   Added after day one in the gym: the library was machine-heavy and had
   six arm movements total, which is not enough to pick a curl you can
   actually get a bench for on a busy evening.
   ============================================================ */
const SLOTS3 = [
  { id: 'biceps', name: 'Biceps',            muscles: ['biceps', 'brachialis'] },
  { id: 'triceps',name: 'Triceps',           muscles: ['triceps'] },
  { id: 'unilat', name: 'Single leg / lunge',muscles: ['quads', 'glutes', 'hams'] }
];

const EX3 = [
  // ---------------- BICEPS ----------------
  { id:'bbcurl',      slot:'biceps', name:'Barbell curl',              inc:5,  equip:'bar',
    joints:{elbow:1,wrist:1,shoulder:0}, cue:'Elbows pinned to the ribs. If the hips start swinging, the set is over.' },
  { id:'ezcurlb',     slot:'biceps', name:'EZ-bar curl',               inc:5,  equip:'bar',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'The angled grip takes the wrist out of it. Same rule on the elbows.' },
  { id:'dbcurl',      slot:'biceps', name:'Dumbbell curl',             inc:5,  equip:'db',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Supinate as you come up, little finger turning toward the ceiling.' },
  { id:'dbcurlseat',  slot:'biceps', name:'Seated dumbbell curl',      inc:5,  equip:'db',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Sitting kills the leg drive, so the weight drops and the biceps work harder.' },
  { id:'inclcurlb',   slot:'biceps', name:'Incline dumbbell curl',     inc:5,  equip:'db',
    joints:{elbow:1,wrist:0,shoulder:1}, cue:'Bench at about 45 degrees, arms hanging behind the torso. The stretch is the point.' },
  { id:'spidercurl',  slot:'biceps', name:'Spider curl',               inc:5,  equip:'db',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Chest on an incline bench, arms straight down. No body English is possible, which is why it works.' },
  { id:'preachbb',    slot:'biceps', name:'Preacher curl (barbell)',   inc:5,  equip:'bar',
    joints:{elbow:2,wrist:1,shoulder:0}, cue:'Do not slam into a locked elbow at the bottom. Stop just short.' },
  { id:'preachmach',  slot:'biceps', name:'Preacher curl (machine)',   inc:5,  equip:'machine',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Line the elbow up with the pivot. The pad does the stabilising so you can push the set harder.' },
  { id:'preachdb',    slot:'biceps', name:'One-arm DB preacher curl',  inc:5,  equip:'db',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'One arm at a time finds the side that is lagging.' },
  { id:'hammerb',     slot:'biceps', name:'Hammer curl',               inc:5,  equip:'db',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Neutral grip. This is the brachialis and the forearm as much as the biceps.' },
  { id:'crosshammer', slot:'biceps', name:'Cross-body hammer curl',    inc:5,  equip:'db',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Across the chest toward the opposite shoulder.' },
  { id:'concurl',     slot:'biceps', name:'Concentration curl',        inc:5,  equip:'db',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Elbow braced on the inner thigh. Slow on the way down.' },
  { id:'cablecurl',   slot:'biceps', name:'Cable curl',                inc:5,  equip:'cable',
    joints:{elbow:1,wrist:1,shoulder:0}, cue:'Tension never drops off at the top, unlike a barbell.' },
  { id:'ropecurl',    slot:'biceps', name:'Rope cable curl',           inc:5,  equip:'cable',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Neutral grip, pull the ends apart at the top.' },
  { id:'bayescurl',   slot:'biceps', name:'Bayesian cable curl',       inc:5,  equip:'cable',
    joints:{elbow:1,wrist:0,shoulder:1}, cue:'Face away from a low pulley, arm behind you. Loads the stretched position.' },
  { id:'revcurl',     slot:'biceps', name:'Reverse curl',              inc:5,  equip:'bar',
    joints:{elbow:1,wrist:1,shoulder:0}, cue:'Overhand grip. Expect to use far less weight and do not force it.' },
  { id:'dragcurl',    slot:'biceps', name:'Drag curl',                 inc:5,  equip:'bar',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Drag the bar up the torso, elbows travelling back rather than the bar arcing out.' },
  { id:'zottman',     slot:'biceps', name:'Zottman curl',              inc:5,  equip:'db',
    joints:{elbow:1,wrist:1,shoulder:0}, cue:'Up supinated, turn over at the top, down pronated.' },

  // ---------------- TRICEPS ----------------
  { id:'cgbench',     slot:'triceps',name:'Close-grip bench press',    inc:10, equip:'bar',
    joints:{elbow:1,shoulder:1,wrist:1}, cue:'Hands about shoulder width, not narrower. Elbows tucked.' },
  { id:'skullez',     slot:'triceps',name:'Skull crusher (EZ bar)',    inc:5,  equip:'bar',
    joints:{elbow:2,shoulder:1,wrist:0}, cue:'Lower behind the forehead, not to it. Stop if the elbows complain.' },
  { id:'jmpress',     slot:'triceps',name:'JM press',                  inc:5,  equip:'bar',
    joints:{elbow:2,shoulder:1,wrist:1}, cue:'Half skull crusher, half close-grip press. Heavier than it looks.' },
  { id:'ohdbext',     slot:'triceps',name:'Overhead DB extension',     inc:5,  equip:'db',
    joints:{elbow:1,shoulder:1,wrist:0}, cue:'One heavy dumbbell in both hands. The overhead position is where the long head grows.' },
  { id:'ohropeext',   slot:'triceps',name:'Overhead rope extension',   inc:5,  equip:'cable',
    joints:{elbow:1,shoulder:1,wrist:0}, cue:'Step away from the stack so the cable pulls the elbows into a real stretch.' },
  { id:'pushdownbar', slot:'triceps',name:'Cable pushdown (bar)',      inc:5,  equip:'cable',
    joints:{elbow:1,wrist:1,shoulder:0}, cue:'Elbows at the sides. Lean in slightly, do not turn it into a press.' },
  { id:'pushdownrope',slot:'triceps',name:'Rope pushdown',             inc:5,  equip:'cable',
    joints:{elbow:1,wrist:0,shoulder:0}, cue:'Spread the rope at the bottom and hold for a beat.' },
  { id:'dipparallel', slot:'triceps',name:'Parallel bar dip',          inc:5,  equip:'bw',
    joints:{shoulder:2,elbow:1,wrist:1}, cue:'Stay upright to keep it on the triceps. Stop at the depth where the shoulder is still comfortable.' },
  { id:'benchdip',    slot:'triceps',name:'Bench dip',                 inc:5,  equip:'bw',
    joints:{shoulder:2,elbow:1,wrist:1}, cue:'Hard on the front of the shoulder. Skip it if that is a problem area.' },
  { id:'machdip',     slot:'triceps',name:'Triceps extension machine', inc:5,  equip:'machine',
    joints:{elbow:1,shoulder:0,wrist:0}, cue:'The lowest joint cost in this slot. Where to go when the elbows are sore.' },
  { id:'kickback',    slot:'triceps',name:'Dumbbell kickback',         inc:5,  equip:'db',
    joints:{elbow:1,shoulder:0,wrist:0}, cue:'Light weight, full lockout, squeeze. A finisher, not a main lift.' },

  // ---------------- SINGLE LEG / LUNGE ----------------
  { id:'walklunge',   slot:'unilat', name:'Walking lunge',             inc:5,  equip:'db',
    joints:{knee:1,hip:1,lowback:0}, cue:'Long stride for glutes, short for quads. Torso upright.' },
  { id:'fwdlunge',    slot:'unilat', name:'Forward lunge',             inc:5,  equip:'db',
    joints:{knee:2,hip:1,lowback:0}, cue:'Hardest on the knee of the lunge family. Control the landing.' },
  { id:'revlungeu',   slot:'unilat', name:'Reverse lunge',             inc:5,  equip:'db',
    joints:{knee:1,hip:1,lowback:0}, cue:'Stepping back is kinder to the knee than stepping forward.' },
  { id:'latlunge',    slot:'unilat', name:'Lateral lunge',             inc:5,  equip:'db',
    joints:{knee:1,hip:1,lowback:0}, cue:'Sit into the hip of the working side, trailing leg straight.' },
  { id:'curtsy',      slot:'unilat', name:'Curtsy lunge',              inc:5,  equip:'db',
    joints:{knee:1,hip:1,lowback:0}, cue:'Step behind and across. Glute medius work, keep it light.' },
  { id:'splitsq',     slot:'unilat', name:'Split squat',               inc:5,  equip:'db',
    joints:{knee:1,hip:1,lowback:0}, cue:'Both feet planted the whole set. Easier to load heavy than a walking lunge.' },
  { id:'bulgu',       slot:'unilat', name:'Bulgarian split squat',     inc:5,  equip:'db',
    joints:{knee:1,hip:1,lowback:0}, cue:'Rear foot elevated. Front shin roughly vertical unless you want more knee.' },
  { id:'stepupu',     slot:'unilat', name:'Step-up',                   inc:5,  equip:'db',
    joints:{knee:1,hip:1,lowback:0}, cue:'Drive through the top foot. Do not push off the floor with the trailing leg.' },
  { id:'slsquat',     slot:'unilat', name:'Assisted pistol squat',     inc:5,  equip:'bw',
    joints:{knee:2,hip:1,lowback:0}, cue:'Hold a strap or the rack. Depth only as far as the knee tolerates.' },
  { id:'slrdl',       slot:'unilat', name:'Single-leg RDL',            inc:5,  equip:'db',
    joints:{hip:1,lowback:1,knee:0}, cue:'Hips square. The reach comes from the hip, not the low back.' },
  { id:'slpress',     slot:'unilat', name:'Single-leg press',          inc:10, equip:'machine',
    joints:{knee:1,hip:1,lowback:0}, cue:'Foot centred on the platform. The lowest balance demand in this slot.' },

  // ---------------- CALVES ----------------
  { id:'legpresscalf',slot:'calves', name:'Leg press calf raise',      inc:10, equip:'machine',
    joints:{knee:0,hip:0,lowback:0}, cue:'Balls of the feet on the bottom edge. Full stretch at the bottom, pause at the top.' },
  { id:'smithcalf',   slot:'calves', name:'Smith machine calf raise',  inc:10, equip:'machine',
    joints:{knee:0,hip:0,lowback:1}, cue:'Stand on a plate for range. Slow, no bouncing.' },
  { id:'dbcalf',      slot:'calves', name:'Dumbbell calf raise',       inc:5,  equip:'db',
    joints:{knee:0,hip:0,lowback:0}, cue:'One heavy dumbbell, free hand on the rack for balance.' },
  { id:'slcalf',      slot:'calves', name:'Single-leg calf raise',     inc:5,  equip:'bw',
    joints:{knee:0,hip:0,lowback:0}, cue:'Bodyweight is plenty to start. Full range beats extra load here.' },
  { id:'donkeycalf',  slot:'calves', name:'Donkey calf raise',         inc:10, equip:'machine',
    joints:{knee:0,hip:0,lowback:1}, cue:'Hips hinged forward puts the gastroc on more stretch.' },
  { id:'tibraise',    slot:'calves', name:'Tibialis raise',            inc:5,  equip:'bw',
    joints:{knee:0,hip:0,lowback:0}, cue:'The front of the shin. Balances out all the calf work and helps the knees.' },

  // ---------------- CHEST, FREE WEIGHT ----------------
  { id:'inclbb',      slot:'hpress', name:'Incline barbell bench',     inc:5,  equip:'bar',
    joints:{shoulder:2,elbow:1,wrist:1}, cue:'Bench at 30 degrees, not 45. Higher than that turns it into a shoulder press.' },
  { id:'dbfly',       slot:'hpress', name:'Dumbbell fly',              inc:5,  equip:'db',
    joints:{shoulder:2,elbow:0,wrist:0}, cue:'Soft elbows, wide arc. Stop at chest level, not below.' },
  { id:'cablecross',  slot:'hpress', name:'Cable crossover',           inc:5,  equip:'cable',
    joints:{shoulder:1,elbow:0,wrist:0}, cue:'High pulleys, cross the hands at the bottom of each rep.' },
  { id:'lowcablefly', slot:'hpress', name:'Low-to-high cable fly',     inc:5,  equip:'cable',
    joints:{shoulder:1,elbow:0,wrist:0}, cue:'Upper chest. Finish with the hands near chin height.' },
  { id:'floorpress',  slot:'hpress', name:'Floor press',               inc:5,  equip:'bar',
    joints:{shoulder:1,elbow:1,wrist:1}, cue:'The floor stops the elbow before the shoulder gets stretched. Useful when the shoulder is cranky.' },

  // ---------------- SHOULDERS, FREE WEIGHT ----------------
  { id:'dbohp',       slot:'vpress', name:'Standing DB overhead press',inc:5,  equip:'db',
    joints:{shoulder:2,elbow:1,lowback:1}, cue:'Squeeze the glutes so the low back does not take the press.' },
  { id:'pushpress',   slot:'vpress', name:'Push press',                inc:5,  equip:'bar',
    joints:{shoulder:2,elbow:1,lowback:1}, cue:'A short dip and drive from the legs. Lets you overload the top half.' },
  { id:'rearfly',     slot:'vpress', name:'Bent-over rear delt fly',   inc:5,  equip:'db',
    joints:{shoulder:1,elbow:0,wrist:0}, cue:'Thumbs down, lead with the elbows. Very light weight.' },
  { id:'leanlat',     slot:'vpress', name:'Leaning cable lateral',     inc:5,  equip:'cable',
    joints:{shoulder:1,elbow:0,wrist:0}, cue:'Lean away from the stack. Loads the delt at the bottom where a dumbbell does not.' },
  { id:'plateraise',  slot:'vpress', name:'Front plate raise',         inc:5,  equip:'db',
    joints:{shoulder:1,elbow:0,wrist:1}, cue:'To eye level, no higher. Most people already get enough front delt from pressing.' },

  // ---------------- BACK, FREE WEIGHT ----------------
  { id:'bbrow',       slot:'hpull',  name:'Bent-over barbell row',     inc:10, equip:'bar',
    joints:{lowback:2,shoulder:1,elbow:1}, cue:'Hinge to about 45 degrees and hold it. The low back pays for this one.' },
  { id:'sealrow',     slot:'hpull',  name:'Seal row',                  inc:10, equip:'bar',
    joints:{lowback:0,shoulder:1,elbow:1}, cue:'Chest on a raised bench. All the barbell row, none of the low back.' },
  { id:'meadows',     slot:'hpull',  name:'Meadows row',               inc:10, equip:'bar',
    joints:{lowback:1,shoulder:1,elbow:1}, cue:'Landmine, staggered stance, one arm. Big stretch on the lat.' },
  { id:'krocrow',     slot:'hpull',  name:'Kroc row',                  inc:5,  equip:'db',
    joints:{lowback:1,shoulder:1,elbow:1}, cue:'Heavy one-arm row, high reps, a little body English allowed.' },

  // ---------------- LEGS, FREE WEIGHT ----------------
  { id:'backsq',      slot:'squat',  name:'Back squat',                inc:10, equip:'rack',
    joints:{knee:2,lowback:2,hip:1}, cue:'Brace before you unrack. Depth that keeps the pelvis neutral, not depth for its own sake.' },
  { id:'dbsquat',     slot:'squat',  name:'Dumbbell squat',            inc:5,  equip:'db',
    joints:{knee:1,lowback:1,hip:1}, cue:'Dumbbells at the sides. Easy to bail out of, which makes it a good heavy-day substitute.' },
  { id:'dbrdl',       slot:'hinge',  name:'Dumbbell RDL',              inc:5,  equip:'db',
    joints:{lowback:1,hip:1,knee:0}, cue:'Push the hips back, dumbbells tracking down the thighs. Stop where the hamstring stops, not where the back rounds.' },
  { id:'sumodl',      slot:'hinge',  name:'Sumo deadlift',             inc:10, equip:'bar',
    joints:{lowback:2,hip:2,knee:1}, cue:'Wide stance, upright torso. Easier on the low back than conventional for most people.' },
  { id:'stifflegdl',  slot:'hinge',  name:'Stiff-leg deadlift',        inc:10, equip:'bar',
    joints:{lowback:2,hip:1,knee:0}, cue:'Minimal knee bend. The most low-back cost of the hinge family, so earn it first.' },

  // ---------------- CORE ----------------
  { id:'plank',       slot:'core',   name:'Weighted plank',            inc:5,  equip:'bw',
    joints:{lowback:0,shoulder:1,hip:0}, cue:'Ribs down, glutes on. Time under tension, not a personal best in minutes.' },
  { id:'paloff',      slot:'core',   name:'Pallof press',              inc:5,  equip:'cable',
    joints:{lowback:0,shoulder:1,hip:0}, cue:'Resist the rotation. Nothing should move but the arms.' },
  { id:'deadbug',     slot:'core',   name:'Dead bug',                  inc:5,  equip:'bw',
    joints:{lowback:0,shoulder:0,hip:0}, cue:'Low back flat on the floor the whole time. Slow beats many.' },
  { id:'sideplank',   slot:'core',   name:'Side plank',                inc:5,  equip:'bw',
    joints:{lowback:0,shoulder:1,hip:0}, cue:'Stack the shoulders and hips. Obliques.' }
];

const SLOTS2 = [
  { id: 'arms',   name: 'Arms',        muscles: ['biceps', 'triceps'] },
  { id: 'calves', name: 'Calves',      muscles: ['calves'] },
  { id: 'core',   name: 'Core',        muscles: ['abs', 'obliques'] }
];

SLOTS2.concat(SLOTS3).forEach(s2 => { if (!SLOTS.find(x => x.id === s2.id)) SLOTS.push(s2); });
EX2.concat(EX3).forEach(e => { if (!EX.find(x => x.id === e.id)) { e.video = VID(e.name); EX.push(e); } });

// default equipment for the originals, and fold the new lifts into substitution
EX.forEach(e => { if (!e.equip) e.equip = /machine|press|pulldown|curl|deck|extension/i.test(e.name) ? 'machine' : 'db'; });
Object.keys(SUBS).forEach(slot => {
  EX.filter(e => e.slot === slot && !SUBS[slot].includes(e.id))
    .sort((a, b) => jointCost(a) - jointCost(b))
    .forEach(e => SUBS[slot].push(e.id));
});
['arms','calves','core','biceps','triceps','unilat'].forEach(slot => {
  SUBS[slot] = EX.filter(e => e.slot === slot).sort((a, b) => jointCost(a) - jointCost(b)).map(e => e.id);
});
function jointCost(e) {
  return JOINTS.reduce((t, j) => t + ((e.joints && e.joints[j]) || 0), 0);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EX, SUBS, SLOTS, JOINTS, byId };
}
