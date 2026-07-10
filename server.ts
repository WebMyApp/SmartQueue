import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Google GenAI with correct options
const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Endpoint for Smart Queue Advisor
app.post("/api/advisor", async (req, res) => {
  try {
    const { data, branchName, role } = req.body;

    if (!apiKey) {
      return res.status(200).json({
        success: false,
        advice: "Kunci API Gemini (GEMINI_API_KEY) belum dikonfigurasi di pengaturan rahasia (Secrets). Silakan tambahkan kunci API terlebih dahulu untuk mengaktifkan saran pintar AI.",
      });
    }

    let prompt = "";
    if (role === "super_admin") {
      prompt = `Anda adalah seorang Asisten Konsultan Operasional Ritel Pintar (Smart Retail Advisor).
Analisis data kinerja cabang-cabang toko berikut:
${JSON.stringify(data, null, 2)}

Tugas Anda adalah memberikan laporan analisis eksekutif yang ringkas, tajam, dan langsung dapat ditindaklanjuti (actionable) untuk Super Admin dalam Bahasa Indonesia.
Berikan saran tentang:
1. Cabang dengan performa terbaik dan yang paling kritis (butuh penanganan segera karena antrean menumpuk atau waktu tunggu lama).
2. Saran alokasi staf atau loket (counter) di masing-masing cabang.
3. Pola perbaikan alur antrean pelanggan agar lebih cepat.
Format jawaban Anda dengan Markdown yang rapi, berikan penekanan dengan cetak tebal pada poin penting. Singkat dan profesional (maksimal 250 kata).`;
    } else {
      prompt = `Anda adalah asisten manajer operasional toko pintar (Smart Queue Advisor) untuk cabang "${branchName}".
Analisis data antrean terkini di cabang ini:
${JSON.stringify(data, null, 2)}

Berikan 3 rekomendasi real-time yang taktis, ringkas, dan langsung dapat dieksekusi oleh staf cabang dalam Bahasa Indonesia.
Rekomendasi harus fokus pada:
- Cara mengurangi waktu tunggu pelanggan.
- Pengaturan pembukaan/penutupan Loket (counter) aktif.
- Penanganan tipe layanan tertentu yang sedang sibuk.
Gunakan format Markdown dengan poin-poin yang jelas dan persuasif. Maksimal 150 kata.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({
      success: true,
      advice: response.text || "Gagal memproses analisis antrean.",
    });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Terjadi kesalahan internal saat menghubungi Gemini AI.",
    });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
