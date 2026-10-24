/*
  ADS BOX promotions. They show in the pop-up when someone opens the site,
  and in the "Promotions" row right after the cover.
  To add one: put the poster in assets/promo/ (square image), copy a block below and change the text.
  To stop a promotion: delete its block. Set "popup: false" to keep it off the pop-up.
*/
window.PROMOS = [
  {
    id: "boost-page",
    image: "assets/promo/promo-boost-page.jpg",
    thumb: "assets/promo/promo-boost-page-sm.jpg",
    badge: { kh: "បញ្ចុះតម្លៃពិសេស", en: "Special offer" },
    title: { kh: "សេវាកម្ម ប៊ូស៍ផេក", en: "Boost Facebook Page" },
    price: { kh: "$79 / ខែ", en: "$79 / month" },
    points: {
      kh: ["ប្រព័ន្ធតបសារដោយស្វ័យប្រវត្តិ", "កែសម្រួលវីដេអូ ប៊ូស (x2)", "ការគ្រប់គ្រង ហ្វេសប៊ុកផេក", "រៀបចំផេកត្រូវស្តង់ដារ ហ្វេសប៊ុក", "ដោះស្រាយបញ្ហាផេកនានា", "Telegram Group មេរៀន"],
      en: ["Auto-reply system", "Boost video editing (x2)", "Facebook Page management", "Page set up to Facebook standards", "Page problems fixed", "Lessons Telegram group"]
    },
    popup: true
  },
  {
    id: "live-video",
    image: "assets/promo/promo-live-video.jpg",
    thumb: "assets/promo/promo-live-video-sm.jpg",
    badge: { kh: "ថ្មី", en: "New" },
    title: { kh: "សេវាកម្ម ចាក់វីដេអូឡាយ", en: "Live video streaming" },
    price: { kh: "ត្រឹមតែ $120", en: "Only $120" },
    points: {
      kh: ["ប្រព័ន្ធតបសារដោយស្វ័យប្រវត្តិ", "ចាក់វីដេអូឡាយប្រចាំថ្ងៃ", "ការគ្រប់គ្រង ហ្វេសប៊ុកផេក", "ដោះស្រាយបញ្ហាផេកនានា", "Telegram Group មេរៀន", "ប្រឹក្សាពីយុទ្ធសាស្ត្រនៃការ ឡាយ"],
      en: ["Auto-reply system", "Daily live video streaming", "Facebook Page management", "Page problems fixed", "Lessons Telegram group", "Live strategy advice"]
    },
    popup: true
  }
];
