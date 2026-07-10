/**
 * Helper to call queue numbers using native HTML5 speech synthesis in Indonesian.
 */
export function speakQueueCall(queueNumber: string, counterNumber: number) {
  if (!("speechSynthesis" in window)) return;

  // Split queueNumber like "A-005" to "A" and "005"
  const parts = queueNumber.split("-");
  const prefix = parts[0] ? parts[0].toUpperCase() : "";
  const numberStr = parts[1] || "";

  // Convert "005" into individual spaced numbers so synthesis reads them one by one (e.g. "kosong kosong lima")
  let digitsRead = "";
  for (let i = 0; i < numberStr.length; i++) {
    const digit = numberStr[i];
    if (digit === "0") digitsRead += "kosong ";
    else if (digit === "1") digitsRead += "satu ";
    else if (digit === "2") digitsRead += "dua ";
    else if (digit === "3") digitsRead += "tiga ";
    else if (digit === "4") digitsRead += "empat ";
    else if (digit === "5") digitsRead += "lima ";
    else if (digit === "6") digitsRead += "enam ";
    else if (digit === "7") digitsRead += "tujuh ";
    else if (digit === "8") digitsRead += "delapan ";
    else if (digit === "9") digitsRead += "sembilan ";
  }

  const text = `Nomor antrean, ${prefix}, ${digitsRead}. Silakan ke loket ${counterNumber}.`;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "id-ID";
  utterance.rate = 0.85; // Natural pacing

  // Find Indonesian voice
  const voices = window.speechSynthesis.getVoices();
  const idVoice = voices.find(v => v.lang.startsWith("id") || v.lang.includes("ID") || v.name.toLowerCase().includes("indonesian"));
  if (idVoice) {
    utterance.voice = idVoice;
  }

  window.speechSynthesis.speak(utterance);
}
