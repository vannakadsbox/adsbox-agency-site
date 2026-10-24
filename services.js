/*
  ADS BOX services.
  Set popular: true to show a "Popular" badge.
  To show a price, fill in "price" (for example "$10" or "ចាប់ពី $10"). Leave it empty to show "Ask for price".
  Each service has an "id" (its picture is assets/services/<id>.jpg) and 3 "emoji" for that picture.
  Add "poster" (a square image in assets/promo/) to show that poster when someone taps "លម្អិត".
  After changing names or emoji, run:  node tools/service-thumbs.js --all
*/
window.SERVICE_GROUPS = [
  {
    id: "boost",
    name: { kh: "ផ្សព្វផ្សាយ និង Boost", en: "Boost & ads" },
    services: [
      {
        id: "boost-post",
        poster: "assets/promo/promo-boost-page.jpg",
        emoji: ["📣", "💬", "📈"],
        name: { kh: "សេវាកម្មគ្រប់គ្រងផេក (Boost Post)", en: "Facebook post boosting" },
        popular: true,
        desc: { kh: "យើងរៀបចំ Target ថវិកា និងតាមដានលទ្ធផល ដើម្បីឲ្យប៉ុស្ត៍របស់អ្នកទទួលបានសារពីអតិថិជនពិតៗ។", en: "We set the audience and budget and track results, so your posts bring messages from real customers." },
        price: ""
      },
      {
        id: "boost-tiktok",
        emoji: ["🎵", "📱", "🔥"],
        name: { kh: "សេវាកម្មគ្រប់គ្រងតិចតុក (Boost TikTok)", en: "TikTok boosting" },
        desc: { kh: "ផ្សព្វផ្សាយវីដេអូ TikTok ឲ្យដល់អ្នកមើលដែលត្រូវគោលដៅ និងបង្កើនអ្នកតាមដាន។", en: "Promote your TikTok videos to the right viewers and grow your followers." },
        price: ""
      },
      {
        id: "boost-live",
        poster: "assets/promo/promo-live-video.jpg",
        emoji: ["🎥", "🛒", "⚡"],
        name: { kh: "សេវាកម្មគ្រប់គ្រងផេក (Boost Live)", en: "Facebook Live boosting" },
        popular: true,
        desc: { kh: "Boost ពេលកំពុង Live ដើម្បីនាំអ្នកមើលចូលលឿន និងបង្កើនការកម្ម៉ង់។", en: "Boost while you are live to bring viewers in fast and get more orders." },
        price: ""
      },
      {
        id: "live-page-setup",
        emoji: ["⚙️", "📺", "✅"],
        name: { kh: "សេវាកម្មតម្លើងផេកប៊ូសឡាយ", en: "Page setup for Live boosting" },
        desc: { kh: "រៀបចំផេក និងគណនីផ្សាយពាណិជ្ជកម្មរបស់អ្នក ឲ្យរួចរាល់សម្រាប់ Boost Live។", en: "Get your page and ad account ready to boost Lives." },
        price: ""
      }
    ]
  },
  {
    id: "design",
    name: { kh: "រចនា និងវេបសាយ", en: "Design & website" },
    services: [
      {
        id: "design-video",
        emoji: ["🎨", "🎬", "✨"],
        name: { kh: "សេវាកម្ម Design រូបភាព និងកាត់តវីដេអូ", en: "Graphic design & video editing" },
        desc: { kh: "រចនារូបភាពប៉ុស្ត៍ ប៉ូស្ទ័រ និងកាត់តវីដេអូខ្លីសម្រាប់ផ្សព្វផ្សាយ។", en: "Post graphics, posters and short promo videos." },
        price: ""
      },
      {
        id: "website",
        emoji: ["💻", "🌐", "📱"],
        name: { kh: "សេវាកម្ម Website Development", en: "Website development" },
        desc: { kh: "បង្កើតវេបសាយសម្រាប់អាជីវកម្មរបស់អ្នក ដែលមើលស្រួលលើទូរស័ព្ទ។", en: "A website for your business that works well on phones." },
        price: ""
      }
    ]
  },
  {
    id: "care",
    name: { kh: "ថែទាំផេក និងគណនី", en: "Page & account care" },
    services: [
      {
        id: "blue-verify",
        emoji: ["🏅", "🛡️", "📄"],
        name: { kh: "សេវាកម្មស្នើសុំ Blue Verify", en: "Blue Verify application" },
        desc: { kh: "ជួយរៀបចំឯកសារ និងដាក់ពាក្យស្នើសុំសញ្ញាផ្ទៀងផ្ទាត់ពណ៌ខៀវ (Meta Verified) ឲ្យផេករបស់អ្នក។", en: "We prepare documents and apply for the blue verified badge (Meta Verified) for your page." },
        price: ""
      },
      {
        id: "troubleshoot",
        emoji: ["🛠️", "⚠️", "✅"],
        name: { kh: "សេវាកម្មដោះស្រាយបញ្ហាផេក និង Accounts", en: "Page & account troubleshooting" },
        desc: { kh: "ពិនិត្យ និងជួយដោះស្រាយផេក ឬគណនីដែលត្រូវបានរឹតត្បិត ឬមានបញ្ហា។", en: "We check and help fix pages or accounts that are restricted or have problems." },
        price: ""
      },
      {
        id: "group-share",
        emoji: ["👥", "🔁", "📢"],
        name: { kh: "សេវាកម្មជួល Group Share", en: "Group sharing" },
        desc: { kh: "ចែករំលែកប៉ុស្ត៍របស់អ្នកទៅក្នុង Group ដែលពាក់ព័ន្ធ ដើម្បីឲ្យមនុស្សច្រើនឃើញ។", en: "Share your posts into relevant groups so more people see them." },
        price: ""
      }
    ]
  },
  {
    id: "live",
    name: { kh: "លក់ Live និងមេរៀន", en: "Live selling & training" },
    services: [
      {
        id: "live-studio",
        emoji: ["💡", "🎙️", "📷"],
        name: { kh: "សេវាកម្មរៀបចំកន្លែងឡាយ", en: "Live studio setup" },
        desc: { kh: "រៀបចំភ្លើង កាមេរ៉ា សំឡេង និងផ្ទៃខាងក្រោយ សម្រាប់ Live ឲ្យមើលទៅអាជីព។", en: "Lights, camera, sound and background set up so your Live looks professional." },
        price: ""
      },
      {
        id: "courses",
        emoji: ["🎓", "📚", "💡"],
        name: { kh: "លក់មេរៀនបច្ចេកទេស", en: "Technical courses" },
        desc: { kh: "មេរៀនរៀន Boost រចនា និងលក់តាមអនឡាញ ដែលអ្នកអាចអនុវត្តបានភ្លាម។", en: "Courses on boosting, design and online selling that you can use right away." },
        price: ""
      }
    ]
  }
];
