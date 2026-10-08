/** Emoji for the "Add a blocked time type" picker, grouped like the reference's category tabs. */
export type EmojiCategory = 'people' | 'nature' | 'food' | 'activity' | 'travel' | 'objects' | 'symbols' | 'flags'

export interface EmojiEntry {
  char: string
  name: string
}

const list = (pairs: string): EmojiEntry[] =>
  pairs
    .trim()
    .split('\n')
    .map((line) => {
      const [char, ...name] = line.trim().split(' ')
      return { char, name: name.join(' ') }
    })

export const EMOJI: Record<EmojiCategory, EmojiEntry[]> = {
  people: list(`
😀 grinning face
😃 grinning face with big eyes
😄 grinning face with smiling eyes
😁 beaming face
😆 grinning squinting face
😅 grinning face with sweat
🤣 rolling on the floor laughing
😂 face with tears of joy
🙂 slightly smiling face
🙃 upside-down face
😉 winking face
😊 smiling face with smiling eyes
😇 smiling face with halo
🥰 smiling face with hearts
😍 smiling face with heart-eyes
🤩 star-struck
😘 face blowing a kiss
😋 face savoring food
😛 face with tongue
😜 winking face with tongue
🤪 zany face
🤗 smiling face with open hands
🤭 face with hand over mouth
🤫 shushing face
🤔 thinking face
😐 neutral face
😑 expressionless face
😶 face without mouth
😏 smirking face
😒 unamused face
🙄 face with rolling eyes
😬 grimacing face
😌 relieved face
😔 pensive face
😪 sleepy face
😴 sleeping face
😷 face with medical mask
🤒 face with thermometer
🤧 sneezing face
🥵 hot face
🥶 cold face
🥳 partying face
😎 smiling face with sunglasses
🤓 nerd face
🧐 face with monocle
😕 confused face
😮 face with open mouth
😲 astonished face
😳 flushed face
🥺 pleading face
😢 crying face
😭 loudly crying face
😱 face screaming in fear
😤 face with steam from nose
😡 enraged face
👋 waving hand
👍 thumbs up
👎 thumbs down
👏 clapping hands
🙌 raising hands
🙏 folded hands
💪 flexed biceps
✍️ writing hand
💅 nail polish
💇 person getting haircut
💆 person getting massage
🧖 person in steamy room
🧑‍🏫 teacher
🧑‍💼 office worker
🏃 person running
🧘 person in lotus position
`),
  nature: list(`
🐶 dog face
🐱 cat face
🐭 mouse face
🐰 rabbit face
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🐯 tiger face
🦁 lion
🐮 cow face
🐷 pig face
🐸 frog
🐵 monkey face
🐔 chicken
🐧 penguin
🐦 bird
🦋 butterfly
🐝 honeybee
🐢 turtle
🐬 dolphin
🐳 spouting whale
🌵 cactus
🌲 evergreen tree
🌳 deciduous tree
🌴 palm tree
🌱 seedling
🌿 herb
🍀 four leaf clover
🍁 maple leaf
🌸 cherry blossom
🌹 rose
🌻 sunflower
🌼 blossom
🌷 tulip
🌞 sun with face
🌙 crescent moon
⭐ star
🌈 rainbow
☀️ sun
☁️ cloud
🌧️ cloud with rain
❄️ snowflake
🔥 fire
💧 droplet
🌊 water wave
`),
  food: list(`
🍏 green apple
🍎 red apple
🍐 pear
🍊 tangerine
🍋 lemon
🍌 banana
🍉 watermelon
🍇 grapes
🍓 strawberry
🫐 blueberries
🍒 cherries
🍑 peach
🥭 mango
🍍 pineapple
🥥 coconut
🥝 kiwi fruit
🥑 avocado
🥕 carrot
🌽 ear of corn
🥦 broccoli
🥐 croissant
🥯 bagel
🍞 bread
🧀 cheese wedge
🥚 egg
🍳 cooking
🥞 pancakes
🥓 bacon
🍔 hamburger
🍟 french fries
🍕 pizza
🌭 hot dog
🥪 sandwich
🌮 taco
🌯 burrito
🥗 green salad
🍝 spaghetti
🍜 steaming bowl
🍣 sushi
🍱 bento box
🍪 cookie
🎂 birthday cake
🍰 shortcake
🧁 cupcake
🍫 chocolate bar
🍩 doughnut
☕ hot beverage
🍵 teacup without handle
🧃 beverage box
🥤 cup with straw
🧋 bubble tea
🍷 wine glass
🍺 beer mug
🥂 clinking glasses
`),
  activity: list(`
⚽ soccer ball
🏀 basketball
🏈 american football
⚾ baseball
🎾 tennis
🏐 volleyball
🏓 ping pong
🏸 badminton
🥊 boxing glove
🥋 martial arts uniform
⛳ flag in hole
🏹 bow and arrow
🎣 fishing pole
🤿 diving mask
🎿 skis
🛹 skateboard
🏋️ person lifting weights
🤸 person cartwheeling
🧗 person climbing
🚴 person biking
🏊 person swimming
🎽 running shirt
🏆 trophy
🥇 1st place medal
🎖️ military medal
🎫 ticket
🎟️ admission tickets
🎭 performing arts
🎨 artist palette
🎬 clapper board
🎤 microphone
🎧 headphone
🎼 musical score
🎹 musical keyboard
🥁 drum
🎸 guitar
🎻 violin
🎲 game die
🧩 puzzle piece
🎯 bullseye
🎳 bowling
🎮 video game
🎉 party popper
🎈 balloon
🎁 wrapped gift
`),
  travel: list(`
🚗 automobile
🚕 taxi
🚌 bus
🚎 trolleybus
🏎️ racing car
🚓 police car
🚑 ambulance
🚒 fire engine
🚚 delivery truck
🚲 bicycle
🛴 kick scooter
🛵 motor scooter
🚂 locomotive
🚆 train
🚇 metro
🚊 tram
✈️ airplane
🛫 airplane departure
🛬 airplane arrival
🚁 helicopter
🚀 rocket
⛵ sailboat
🚤 speedboat
🛳️ passenger ship
⚓ anchor
⛽ fuel pump
🚧 construction
🚦 vertical traffic light
🗺️ world map
🗽 statue of liberty
🏰 castle
🏟️ stadium
🏖️ beach with umbrella
🏝️ desert island
⛰️ mountain
🏕️ camping
🏠 house
🏡 house with garden
🏢 office building
🏥 hospital
🏦 bank
🏨 hotel
🏪 convenience store
🏫 school
💒 wedding
⛪ church
🌆 cityscape at dusk
🌃 night with stars
🎡 ferris wheel
`),
  objects: list(`
⌚ watch
📱 mobile phone
💻 laptop
⌨️ keyboard
🖥️ desktop computer
🖨️ printer
🖱️ computer mouse
📷 camera
📹 video camera
📺 television
📻 radio
⏰ alarm clock
⏳ hourglass not done
⌛ hourglass done
💡 light bulb
🔦 flashlight
🕯️ candle
💸 money with wings
💵 dollar banknote
💶 euro banknote
💳 credit card
🧾 receipt
💎 gem stone
🔧 wrench
🔨 hammer
🛠️ hammer and wrench
🔑 key
🚪 door
🛋️ couch and lamp
🛏️ bed
🧴 lotion bottle
🧼 soap
🧽 sponge
🪒 razor
🪮 hair pick
💈 barber pole
💄 lipstick
💍 ring
👓 glasses
🧳 luggage
☂️ umbrella
🎒 backpack
📚 books
📖 open book
📒 ledger
📝 memo
✏️ pencil
🖊️ pen
📌 pushpin
📎 paperclip
✂️ scissors
📅 calendar
📆 tear-off calendar
🗓️ spiral calendar
📋 clipboard
📈 chart increasing
📦 package
✉️ envelope
📧 e-mail
📞 telephone receiver
🔔 bell
💊 pill
🩺 stethoscope
🩹 adhesive bandage
🧹 broom
🧺 basket
`),
  symbols: list(`
❤️ red heart
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
🤍 white heart
💔 broken heart
💕 two hearts
💖 sparkling heart
💯 hundred points
✅ check mark button
☑️ check box with check
✔️ check mark
❌ cross mark
❎ cross mark button
⭕ hollow red circle
🛑 stop sign
⛔ no entry
🚫 prohibited
⚠️ warning
❗ red exclamation mark
❓ red question mark
💤 zzz
♻️ recycling symbol
⚡ high voltage
✨ sparkles
🌟 glowing star
💫 dizzy
🔴 red circle
🟠 orange circle
🟡 yellow circle
🟢 green circle
🔵 blue circle
🟣 purple circle
⚫ black circle
⚪ white circle
🔶 large orange diamond
🔷 large blue diamond
▶️ play button
⏸️ pause button
⏹️ stop button
🔁 repeat button
🔀 shuffle tracks button
➕ plus
➖ minus
➗ divide
🆕 new button
🆓 free button
🆗 ok button
🅿️ p button
ℹ️ information
🔝 top arrow
🔜 soon arrow
`),
  flags: list(`
🏁 chequered flag
🚩 triangular flag
🎌 crossed flags
🏴 black flag
🏳️ white flag
🏳️‍🌈 rainbow flag
🇵🇹 flag portugal
🇪🇸 flag spain
🇫🇷 flag france
🇩🇪 flag germany
🇮🇹 flag italy
🇬🇧 flag united kingdom
🇮🇪 flag ireland
🇳🇱 flag netherlands
🇧🇪 flag belgium
🇨🇭 flag switzerland
🇦🇹 flag austria
🇸🇪 flag sweden
🇳🇴 flag norway
🇩🇰 flag denmark
🇫🇮 flag finland
🇵🇱 flag poland
🇬🇷 flag greece
🇺🇸 flag united states
🇨🇦 flag canada
🇲🇽 flag mexico
🇧🇷 flag brazil
🇦🇷 flag argentina
🇦🇴 flag angola
🇲🇿 flag mozambique
🇨🇻 flag cape verde
🇿🇦 flag south africa
🇯🇵 flag japan
🇨🇳 flag china
🇮🇳 flag india
🇦🇺 flag australia
🇳🇿 flag new zealand
🇪🇺 flag european union
`),
}

export const EMOJI_CATEGORIES = Object.keys(EMOJI) as EmojiCategory[]

/** Shown first when nothing has been picked yet. */
export const DEFAULT_FREQUENT = ['👍', '😀', '☕', '🥪', '📚', '📆', '💇', '🧘', '🏋️']

export const emojiName = (char: string): string => {
  for (const cat of EMOJI_CATEGORIES) {
    const hit = EMOJI[cat].find((e) => e.char === char)
    if (hit) return hit.name
  }
  return ''
}
