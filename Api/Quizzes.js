// api/quizzes.js
const mongoose = require('mongoose');

// 1. Cấu hình kết nối (Sử dụng biến môi trường để bảo mật)
const MONGODB_URI = process.env.MONGODB_URI;

// Cache kết nối để không bị quá tải khi nhiều người dùng
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// 2. Định nghĩa Schema (Cấu trúc dữ liệu)
const QuizSchema = new mongoose.Schema({
  name: String,
  questions: Array, // Lưu mảng câu hỏi
  count: Number,
  createdAt: { type: Date, default: Date.now }
});

// Kiểm tra xem Model đã tồn tại chưa để tránh lỗi overwrite
const Quiz = mongoose.models.Quiz || mongoose.model('Quiz', QuizSchema);

// 3. Xử lý yêu cầu (Handler)
module.exports = async (req, res) => {
  await connectToDatabase();

  // --- LẤY DANH SÁCH ĐỀ (GET) ---
  if (req.method === 'GET') {
    // Nếu có ID -> Lấy chi tiết đề
    if (req.query.id) {
        try {
            const quiz = await Quiz.findById(req.query.id);
            return res.status(200).json(quiz);
        } catch (error) {
            return res.status(500).json({ error: 'Lỗi lấy chi tiết đề' });
        }
    }
    // Nếu không có ID -> Lấy danh sách (chỉ lấy tên để load nhanh)
    try {
      const quizzes = await Quiz.find().select('name count createdAt').sort({ createdAt: -1 });
      return res.status(200).json(quizzes);
    } catch (error) {
      return res.status(500).json({ error: 'Lỗi lấy danh sách' });
    }
  }

  // --- LƯU ĐỀ MỚI (POST) ---
  if (req.method === 'POST') {
    try {
      const { name, questions, count } = req.body;
      const newQuiz = await Quiz.create({ name, questions, count });
      return res.status(201).json(newQuiz);
    } catch (error) {
      return res.status(500).json({ error: 'Lỗi lưu đề' });
    }
  }

  // --- XÓA ĐỀ (DELETE) ---
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      await Quiz.findByIdAndDelete(id);
      return res.status(200).json({ message: 'Đã xóa' });
    } catch (error) {
      return res.status(500).json({ error: 'Lỗi xóa đề' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

