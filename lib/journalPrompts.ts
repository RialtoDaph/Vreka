export const REFLECTION_PROMPTS = [
  "Apa hal baik yang terjadi hari ini?",
  "Apa yang bikin kamu bersyukur hari ini?",
  "Ada tantangan apa hari ini, dan gimana kamu ngadepinnya?",
  "Apa satu hal yang kamu pelajari hari ini?",
  "Gimana perasaan kamu hari ini, dan kenapa?",
  "Apa yang pengen kamu lakuin beda besok?",
  "Siapa yang bikin hari kamu lebih baik hari ini?",
  "Apa progress kecil yang kamu capai hari ini?",
  "Ada momen apa hari ini yang pengen kamu inget?",
  "Apa yang lagi kamu khawatirin, dan apa yang bisa kamu kontrol soal itu?",
  "Apa satu keputusan bagus yang kamu ambil hari ini?",
  "Apa yang kamu tunda hari ini, dan kenapa?",
  "Kalau bisa kasih satu saran ke diri sendiri pagi tadi, apa itu?",
  "Apa yang bikin kamu senyum hari ini?",
  "Energi kamu hari ini gimana — dari mana asalnya, ke mana perginya?",
] as const;

export function promptForDate(date: Date): string {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return REFLECTION_PROMPTS[dayOfYear % REFLECTION_PROMPTS.length];
}
