import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "./types";

const messages = {
  id: {
    brandTagline: "Persiapan TOPIK II yang terukur",
    navTests: "Simulasi",
    navGuide: "Panduan",
    heroEyebrow: "UNIGATE TOPIK LAB",
    heroTitle: "Ketahui kemampuan TOPIK II Anda, satu soal pada satu waktu.",
    heroBody: "Latihan membaca dan menyimak TOPIK II dengan paket 50 soal, mode ujian atau latihan, serta analisis jawaban yang akurat.",
    chooseTest: "Pilih simulasi",
    chooseSubtitle: "Pilih paket membaca atau menyimak. Setiap paket berisi 50 soal dan bernilai total 100 poin.",
    timed: "Mode ujian",
    timedDesc: "70 menit · otomatis selesai",
    autoSubmit: "otomatis selesai",
    practice: "Mode latihan",
    practiceDesc: "Tanpa batas waktu",
    start: "Mulai simulasi",
    loading: "Menyiapkan simulasi...",
    guideTitle: "Dirancang seperti ujian, dibuat untuk belajar",
    guide1: "Satu soal per layar agar fokus tetap terjaga.",
    guide2: "Jawaban tersimpan otomatis dan dapat dipulihkan setelah memuat ulang.",
    guide3: "Nilai dan pembahasan soal salah tersedia setelah memberi rating.",
    privacy: "Jawaban disimpan tanpa akun dan dianalisis per sesi.",
    question: "Soal",
    answered: "Terjawab",
    previous: "Sebelumnya",
    next: "Berikutnya",
    review: "Tinjau jawaban",
    timeLeft: "Sisa waktu",
    practiceMode: "Mode latihan",
    saveError: "Jawaban belum tersimpan. Coba pilih kembali.",
    reviewTitle: "Periksa jawaban Anda",
    reviewBody: "Anda masih dapat kembali ke soal sebelum mengirim jawaban.",
    unanswered: "Belum dijawab",
    submit: "Kirim jawaban",
    submitConfirm: "Setelah dikirim, jawaban tidak dapat diubah.",
    backToTest: "Kembali ke soal",
    feedbackTitle: "Bagaimana pengalaman simulasi ini?",
    feedbackBody: "Berikan rating untuk membuka nilai dan daftar soal yang perlu ditinjau.",
    emailLabel: "Terima informasi belajar dari UNIGATE (opsional)",
    emailPlaceholder: "nama@email.com",
    consent: "Saya setuju menerima informasi dan pembaruan pembelajaran melalui email.",
    unlock: "Buka hasil saya",
    ratingRequired: "Pilih rating 1 sampai 5 terlebih dahulu.",
    consentRequired: "Centang persetujuan jika ingin menyimpan email.",
    resultTitle: "Hasil simulasi Anda",
    score: "Nilai",
    incorrect: "Perlu ditinjau",
    perfect: "Luar biasa — semua jawaban benar.",
    yourAnswer: "Jawaban Anda",
    correctAnswer: "Jawaban benar",
    explanation: "Pembahasan",
    noAnswer: "Tidak dijawab",
    home: "Kembali ke beranda",
    sessionMissing: "Sesi ini tidak tersedia di browser ini.",
    retry: "Coba lagi",
  },
  ko: {
    brandTagline: "정확하게 확인하는 TOPIK II 실력",
    navTests: "모의고사",
    navGuide: "이용 안내",
    heroEyebrow: "UNIGATE TOPIK LAB",
    heroTitle: "한 문제씩 집중하며, TOPIK II 실력을 확인하세요.",
    heroBody: "TOPIK II 읽기와 듣기 50문항을 실전 또는 연습 모드로 풀고, 정확한 응답 분석과 오답 해설을 확인할 수 있습니다.",
    chooseTest: "모의고사 선택",
    chooseSubtitle: "읽기 또는 듣기 모의고사를 선택하세요. 각 회차는 50문항, 총 100점입니다.",
    timed: "실전 모드",
    timedDesc: "70분 · 시간 종료 시 자동 제출",
    autoSubmit: "시간 종료 시 자동 제출",
    practice: "연습 모드",
    practiceDesc: "시간 제한 없음",
    start: "모의고사 시작",
    loading: "모의고사를 준비하고 있습니다...",
    guideTitle: "시험처럼 집중하고, 학습에 활용하세요",
    guide1: "한 화면에 한 문제만 표시해 집중력을 유지합니다.",
    guide2: "답안은 자동 저장되며 새로고침 후에도 복구됩니다.",
    guide3: "별점 제출 후 점수와 오답 해설을 확인할 수 있습니다.",
    privacy: "회원가입 없이 세션 단위로 응답을 안전하게 수집합니다.",
    question: "문제",
    answered: "답변 완료",
    previous: "이전",
    next: "다음",
    review: "답안 검토",
    timeLeft: "남은 시간",
    practiceMode: "연습 모드",
    saveError: "답안이 저장되지 않았습니다. 다시 선택해 주세요.",
    reviewTitle: "답안을 확인해 주세요",
    reviewBody: "제출 전에는 언제든 문제로 돌아가 답을 수정할 수 있습니다.",
    unanswered: "미답변",
    submit: "답안 제출",
    submitConfirm: "제출 후에는 답안을 수정할 수 없습니다.",
    backToTest: "문제로 돌아가기",
    feedbackTitle: "이번 모의고사는 어떠셨나요?",
    feedbackBody: "별점을 남기면 점수와 다시 확인할 문제를 바로 보여 드립니다.",
    emailLabel: "UNIGATE 학습 정보 받기 (선택)",
    emailPlaceholder: "name@email.com",
    consent: "이메일로 학습 정보와 업데이트를 받는 데 동의합니다.",
    unlock: "결과 확인하기",
    ratingRequired: "먼저 1~5점 별점을 선택해 주세요.",
    consentRequired: "이메일을 저장하려면 정보수신 동의가 필요합니다.",
    resultTitle: "모의고사 결과",
    score: "점수",
    incorrect: "다시 볼 문제",
    perfect: "훌륭합니다. 모든 문제를 맞혔습니다.",
    yourAnswer: "내 답안",
    correctAnswer: "정답",
    explanation: "해설",
    noAnswer: "미응답",
    home: "처음으로",
    sessionMissing: "이 브라우저에서 세션 정보를 찾을 수 없습니다.",
    retry: "다시 시도",
  },
} as const;

type MessageKey = keyof (typeof messages)["id"];
type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: MessageKey) => string };

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    localStorage.getItem("unigate.topik.locale") === "ko" ? "ko" : "id",
  );
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale(next) {
      localStorage.setItem("unigate.topik.locale", next);
      document.documentElement.lang = next;
      setLocaleState(next);
    },
    t: (key) => messages[locale][key],
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
