import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';
import * as fs from 'fs';
import * as path from 'path';
import { getGroqConfig } from 'src/config/groq.config';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private vectorStore: MemoryVectorStore;
  private llm: ChatGroq;
  private embeddings: GoogleGenerativeAIEmbeddings;
  private chain: RunnableSequence;

  constructor() {
    const groqConfig = getGroqConfig();
    this.llm = new ChatGroq({
      apiKey: groqConfig.apiKey,
      model: groqConfig.model,
      temperature: 0.7,
      maxTokens: 1000,
    });

    // Initialize embeddings
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      modelName: 'text-embedding-004',
    });
  }

  async onModuleInit() {
    try {
      await this.initializeRAG();
      this.logger.log('RAG system initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize RAG system:', error);
      throw error;
    }
  }

  private async initializeRAG() {
    // Load and process documents
    const documents = await this.loadDocuments();

    // Split documents
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '.', '!', '?', ';', ',', ' ', ''],
    });

    const splitDocs = await textSplitter.splitDocuments(documents);
    this.logger.log(`Created ${splitDocs.length} document chunks`);

    // Create vector store
    this.vectorStore = await MemoryVectorStore.fromDocuments(
      splitDocs,
      this.embeddings,
    );

    // Create RAG chain
    await this.createRAGChain();
  }

  private async loadDocuments(): Promise<Document[]> {
    try {
      const filePath = path.join(
        process.cwd(),
        'src/common/data/json/dataset_umkm.json',
      );
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);

      const documents: Document[] = [];

      // Convert JSON data to documents
      if (Array.isArray(jsonData)) {
        jsonData.forEach((item, index) => {
          const content = this.formatJSONtoText(item);
          documents.push(
            new Document({
              pageContent: content,
              metadata: {
                source: 'dataset_umkm.json',
                index: index,
                ...item,
              },
            }),
          );
        });
      } else {
        // If it's a single object
        const content = this.formatJSONtoText(jsonData);
        documents.push(
          new Document({
            pageContent: content,
            metadata: {
              source: 'dataset_umkm.json',
              ...jsonData,
            },
          }),
        );
      }

      this.logger.log(
        `Loaded ${documents.length} documents from dataset_umkm.json`,
      );
      return documents;
    } catch (error) {
      this.logger.error('Error loading documents:', error);
      throw new Error('Failed to load document dataset');
    }
  }

  private formatJSONtoText(obj: any): string {
    // Convert JSON object to readable text
    let text = '';

    const processObject = (item: any, prefix = '') => {
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            text += `${prefix}${key}: ${value.join(', ')}\n`;
          } else {
            text += `${prefix}${key}:\n`;
            processObject(value, prefix + '  ');
          }
        } else {
          text += `${prefix}${key}: ${value}\n`;
        }
      }
    };

    processObject(obj);
    return text.trim();
  }

  private async createRAGChain() {
    const prompt = PromptTemplate.fromTemplate(
      `Namamu adalah Sentinela.
        Kamu adalah asisten RAG yang hanya boleh menjawab berdasarkan konteks berikut.

        Aturan:
        - Jawab singkat, jelas, dan spesifik berbasis konteks.
        - Jika informasi tidak ditemukan di konteks, balas dengan:
          "Maaf, aku tidak menemukan informasi yang relevan dalam data yang tersedia untuk pertanyaan ini."
        - Jangan menggunakan pengetahuan di luar konteks. Jangan berasumsi.

        Konteks:
        {context}

        Pertanyaan: {question}

        Jawaban:`,
    );

    this.chain = RunnableSequence.from([
      {
        context: async (input: { question: string }) => {
          const retriever = this.vectorStore.asRetriever({
            k: 5, // Return top 5 relevant documents
            searchType: 'similarity',
          });

          const relevantDocs = await retriever.invoke(input.question);
          return relevantDocs.map((doc) => doc.pageContent).join('\n\n');
        },
        question: (input: { question: string }) => input.question,
      },
      prompt,
      this.llm,
      new StringOutputParser(),
    ]);
  }

  async queryRAG(question: string): Promise<string> {
    try {
      if (!this.chain) {
        throw new Error('RAG chain not initialized');
      }

      this.logger.log(`Processing question: ${question}`);

      const response = await this.chain.invoke({ question });

      this.logger.log(`Generated response for question: ${question}`);
      return response;
    } catch (error) {
      this.logger.error('Error in RAG query:', error);
      throw new Error('Failed to process query');
    }
  }

  async getInsights(): Promise<any> {
    try {
      const prompt = `Buatkan key insight dan key strategy berdasarkan data di atas.
  
      **Pola Penting:**
      1. Hubungan antara sentimen positif dan engagement: Apakah benar konten positif menghasilkan engagement 40% lebih tinggi?
      2. Analisis sentimen netral: Peluang apa yang bisa ditangkap UMKM untuk meningkatkan daya saing dari opini yang belum jelas positif/negative?
      3. Dari sentimen positif, aspek apa yang paling sering dipuji (harga, kualitas, pelayanan, inovasi)? Bagaimana UMKM bisa memanfaatkan hal ini untuk branding?
      4. Berdasarkan analisis sentimen, strategi komunikasi digital apa yang sebaiknya dijalankan UMKM untuk meningkatkan citra di media sosial?
      5. Mengapa hanya 0.6% konten yang berhasil memicu emosi positif?
      6. Potensi Tersembunyi: Apakah ada postingan netral dengan engagement tinggi yang sebenarnya bisa dikategorikan positif?
      7. Analisis bagaimana UMKM lokal di Indonesia saat ini memanfaatkan media sosial untuk membangun citra brand. Identifikasi gap antara penggunaan media sosial tradisional dengan pendekatan analisis sentimen yang lebih canggih. Berikan data statistik terkini dan contoh kasus nyata.

      **Arah Analisis:**
      - Fokus pada: Strategi konten
      - Tujuan: Meningkatkan engagement melalui konten yang lebih emosional
      - Stakeholder: Tim marketing

      **Format Output:**
      1. **Headline Insight**: 1 kalimat singkat yang paling mencolok
      2. **Data Pendukung**: 3-5 angka kunci terkait
      3. **Analisis Mendalam**:
          - Penyebab potensial
          - Implikasi bisnis
          - Perbandingan dengan benchmark
      4. **Rekomendasi Aksi**:
          - 2-3 langkah konkret
          - Timeline implementasi
          - Metrik sukses
      5. **Risiko & Peluang**:
          - Risiko jika tidak diatasi
          - Peluang yang bisa dimanfaatkan
      6. **Saran dan Strategy**:
          - Saran untuk UMKM kedepannya
          - Strategy yang nanti digunakan kedepannya

      **Tingkat Kedalaman:** Komprehensif

      Berikan jawaban yang terstruktur dan mendalam berdasarkan data yang tersedia.`;

      const result = await this.queryRAG(prompt);
      return result;
    } catch (error) {
      this.logger.error('Error getting insights:', error);
      throw new Error(`Failed to generate insights: ${error.message}`);
    }
  }
}
