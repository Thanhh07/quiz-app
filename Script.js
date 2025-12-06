const App = (function() {
    // Cấu hình API Vercel
    const API_URL = '/api/quizzes';

    // State
    const state = {
        library: [],
        currentQuiz: [],
        originalQuiz: [], // Dùng để lưu bản gốc khi trộn đề
        answers: [],
        currentIndex: 0,
        timer: null,
        timeLeft: 0,
        settings: { timeLimit: 30, shuffle: false }
    };

    // ================== 1. TƯƠNG TÁC MONGODB (CLOUD) ==================

    async function loadLibrary() {
        const list = document.getElementById('quizList');
        const badge = document.getElementById('libraryCount');
        
        try {
            if(badge) badge.innerText = 'Đang tải...';
            
            // Gọi Vercel Function
            const res = await fetch(API_URL);
            
            if (!res.ok) {
                // Nếu chưa có API thì bỏ qua để không chặn các chức năng khác
                console.warn('Chưa kết nối API hoặc Lỗi Server');
                if(badge) badge.innerText = 'Offline';
                if(list) list.innerHTML = '<p style="text-align:center; color:#666;">Chế độ Offline (Chưa kết nối Database)</p>';
                return;
            }
            
            const data = await res.json();
            state.library = data;
            
            renderLibrary();
            if(badge) badge.innerText = `${data.length} đề`;
        } catch (e) {
            console.error(e);
            if(list) list.innerHTML = '<p style="text-align:center; color:#666;">Chế độ Offline</p>';
            if(badge) badge.innerText = 'Offline';
        }
    }

    async function saveCurrentQuiz() {
        if (!state.currentQuiz || state.currentQuiz.length === 0) {
            alert('❌ Không có câu hỏi nào để lưu!');
            return;
        }
        
        const name = prompt('Đặt tên bộ đề:', `Đề thi ${new Date().toLocaleDateString('vi-VN')}`);
        if (!name) return;

        showToast('⏳ Đang lưu lên Cloud...');

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    questions: state.currentQuiz,
                    count: state.currentQuiz.length
                })
            });

            if (res.ok) {
                showToast('✅ Lưu thành công!');
                document.getElementById('saveActionSection').style.display = 'none';
                loadLibrary(); // Reload list
            } else {
                throw new Error('Lỗi lưu');
            }
        } catch (e) {
            showToast('❌ Lỗi: Không thể lưu (Kiểm tra kết nối DB)');
            console.error(e);
        }
    }

    async function deleteQuiz(id) {
        if (!confirm('Xóa đề này vĩnh viễn?')) return;
        try {
            const res = await fetch(`${API_URL}?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('🗑️ Đã xóa');
                loadLibrary();
            }
        } catch (e) { showToast('❌ Lỗi xóa'); }
    }

    async function playQuiz(id) {
        showToast('⏳ Đang tải đề...');
        try {
            const res = await fetch(`${API_URL}?id=${id}`);
            const data = await res.json();
            
            if(!data || !data.questions) throw new Error("Dữ liệu đề lỗi");

            // Nạp dữ liệu vào Game
            state.currentQuiz = data.questions;
            prepareQuiz(state.currentQuiz);
            
            showToast(`🚀 Bắt đầu: ${data.name}`);
        } catch (e) { 
            showToast('❌ Lỗi tải đề');
            console.error(e);
        }
    }

    function renderLibrary() {
        const list = document.getElementById('quizList');
        if (!list) return;
        
        if (state.library.length === 0) {
            list.innerHTML = '<p style="text-align:center; width:100%; color:#666;">Chưa có đề nào.</p>';
            return;
        }
        list.innerHTML = state.library.map(q => `
            <div class="quiz-card">
                <div>
                    <h4>${escapeHtml(q.name)}</h4>
                    <div class="meta">📅 ${new Date(q.createdAt).toLocaleDateString()} • 📊 ${q.count} câu</div>
                </div>
                <div class="card-actions">
                    <button class="card-btn btn-play" onclick="app.playQuiz('${q._id}')">▶️ Làm bài</button>
                    <button class="card-btn btn-del" onclick="app.deleteQuiz('${q._id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    // ================== 2. XỬ LÝ NHẬP LIỆU (FILE & TEXT) - PHẦN QUAN TRỌNG ==================

    // Xử lý khi người dùng chọn file
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fileNameDisplay = document.getElementById('fileName');
        if(fileNameDisplay) fileNameDisplay.innerText = file.name;

        // Xử lý file DOCX
        if (file.name.toLowerCase().endsWith('.docx')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                
                // Dùng Mammoth để đọc
                if (typeof mammoth !== 'undefined') {
                    mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                        .then(function(result) {
                            const text = result.value;
                            document.getElementById('smartPasteInput').value = text; // Hiện text ra ô nhập
                            processSmartPaste(); // Tự động phân tích
                        })
                        .catch(function(err) {
                            console.error(err);
                            alert("Lỗi đọc file Word: " + err.message);
                        });
                } else {
                    alert("Thư viện Mammoth chưa tải xong. Vui lòng thử lại sau giây lát.");
                }
            };
            reader.readAsArrayBuffer(file);
        } 
        // Xử lý file JSON
        else if (file.name.toLowerCase().endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    // Hỗ trợ cả 2 định dạng: {questions: [...]} hoặc [...]
                    const questions = Array.isArray(data) ? data : (data.questions || []);
                    
                    if(questions.length > 0) {
                        state.currentQuiz = questions;
                        onQuizLoaded(questions.length);
                    } else {
                        alert("File JSON không có câu hỏi nào hợp lệ.");
                    }
                } catch (err) {
                    alert("File JSON bị lỗi format.");
                }
            };
            reader.readAsText(file);
        } else {
            alert("Chỉ hỗ trợ file .docx hoặc .json");
        }
    }

    function processSmartPaste() {
        const text = document.getElementById('smartPasteInput').value;
        if(!text.trim()) {
            alert("Vui lòng dán nội dung hoặc tải file!");
            return;
        }

        const questions = parseQuestions(text);
        if (questions.length > 0) {
            state.currentQuiz = questions;
            onQuizLoaded(questions.length);
        } else {
            alert('❌ Không nhận diện được câu hỏi nào. Hãy kiểm tra định dạng (Có đáp án A. B. C. D.)');
        }
    }

    function onQuizLoaded(count) {
        // Hiện nút lưu và thông báo thành công
        const saveSection = document.getElementById('saveActionSection');
        if(saveSection) saveSection.style.display = 'block';
        showToast(`✅ Đã tải thành công ${count} câu hỏi`);
    }

    // Logic tách câu hỏi (Regex)
    function parseQuestions(text) {
        // Chuẩn hóa xuống dòng cho đáp án dính liền (VD: A. ĐúngB. Sai)
        text = text.replace(/([^\n])\s+([A-D][\.\)])/g, "$1\n$2");
        
        // Tách các khối câu hỏi
        const blocks = text.split(/\n(?=(?:Câu|Bài|Question)\s*\d+[:\.]|\d+[\.\)])/i).filter(b => b.trim());
        
        return blocks.map((block, idx) => {
            const lines = block.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length < 2) return null;
            
            // Dòng 1 là câu hỏi
            const qText = lines[0].replace(/^(Câu|Bài|Question)?\s*\d+[:\.\)]\s*/i, '').trim();
            
            const answers = [];
            let correct = 0; // Mặc định A
            
            // Các dòng sau là đáp án
            lines.slice(1).forEach(line => {
                // Kiểm tra dấu hiệu đáp án đúng (* hoặc đậm hoặc (Đúng))
                const isCorrect = line.startsWith('*') || line.includes('(Đúng)');
                
                // Xóa ký tự thừa để lấy nội dung đáp án
                const clean = line.replace(/^[\*\-\+]?\s*[A-D][\.\)]\s*/i, '').replace(/\(Đúng\)/gi, '').trim();
                
                if (clean) {
                    answers.push(clean);
                    if (isCorrect) correct = answers.length - 1;
                }
            });
            
            // Chỉ lấy câu có đủ đáp án
            return answers.length >= 2 ? { id: idx, question: qText, answers, correct } : null;
        }).filter(Boolean); // Loại bỏ null
    }

    // ================== 3. LOGIC GAME (QUIZ) ==================

    function prepareQuiz(questions) {
        // Lấy setting từ giao diện
        const timeInput = document.getElementById('timeLimit');
        const shuffleInput = document.getElementById('shuffleToggle');
        
        state.settings.timeLimit = timeInput ? parseInt(timeInput.value) : 30;
        const shuffle = shuffleInput ? shuffleInput.checked : false;
        
        // Clone dữ liệu để không ảnh hưởng bản gốc
        state.currentQuiz = JSON.parse(JSON.stringify(questions));
        
        if (shuffle) {
            state.currentQuiz.sort(() => Math.random() - 0.5);
        }
        
        // Reset trạng thái
        state.currentIndex = 0;
        state.answers = new Array(state.currentQuiz.length).fill(null);
        state.timeLeft = state.settings.timeLimit * 60;
        
        // Chuyển màn hình
        showScreen('quiz-screen');
        renderQuestion();
        startTimer();
    }

    function renderQuestion() {
        const q = state.currentQuiz[state.currentIndex];
        
        // Cập nhật số câu
        document.getElementById('currentQ').innerText = state.currentIndex + 1;
        document.getElementById('totalQ').innerText = state.currentQuiz.length;
        
        // Hiển thị nội dung câu hỏi (hỗ trợ Math)
        const qText = document.getElementById('questionText');
        qText.innerHTML = q.question;
        if(typeof renderMathInElement !== 'undefined') renderMathInElement(qText);
        
        // Hiển thị đáp án
        const container = document.getElementById('answersContainer');
        container.innerHTML = q.answers.map((ans, idx) => `
            <div class="answer-opt ${state.answers[state.currentIndex] === idx ? 'selected' : ''}" 
                 onclick="app.chooseAnswer(${idx})">
                 ${ans}
            </div>
        `).join('');
        
        if(typeof renderMathInElement !== 'undefined') renderMathInElement(container);

        // Nút điều hướng
        const nextBtn = document.getElementById('nextBtn');
        const submitBtn = document.getElementById('submitBtn');
        
        if(state.currentIndex === state.currentQuiz.length - 1) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'block';
        } else {
            nextBtn.style.display = 'block';
            submitBtn.style.display = 'none';
        }
        
        renderNav();
    }

    function chooseAnswer(idx) {
        state.answers[state.currentIndex] = idx;
        renderQuestion(); // Re-render để hiện màu đã chọn
    }

    function submitQuiz() {
        if(state.timer) clearInterval(state.timer);
        
        let correct = 0;
        state.currentQuiz.forEach((q, i) => {
            if (state.answers[i] === q.correct) correct++;
        });
        
        // Hiển thị kết quả
        document.getElementById('scorePoint').innerText = ((correct/state.currentQuiz.length)*10).toFixed(1);
        document.getElementById('correctCount').innerText = correct;
        document.getElementById('wrongCount').innerText = state.currentQuiz.length - correct;
        
        showScreen('result-screen');
    }

    // ================== UTILS ==================
    function startTimer() {
        if(state.timer) clearInterval(state.timer);
        const display = document.getElementById('timerDisplay');
        state.timer = setInterval(() => {
            state.timeLeft--;
            const m = Math.floor(state.timeLeft / 60).toString().padStart(2,'0');
            const s = (state.timeLeft % 60).toString().padStart(2,'0');
            if(display) display.innerText = `${m}:${s}`;
            
            if(state.timeLeft <= 0) {
                alert('Hết giờ làm bài!');
                submitQuiz();
            }
        }, 1000);
    }
    
    function renderNav() {
        const nav = document.getElementById('questionNav');
        if(!nav) return;
        nav.innerHTML = state.answers.map((a, i) => 
            `<div class="nav-item ${a!==null?'done':''}" onclick="app.goto(${i})">${i+1}</div>`
        ).join('');
    }

    function showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.querySelector('.' + name);
        if(target) target.classList.add('active');
    }

    function showToast(msg) {
        const d = document.createElement('div'); 
        d.className='toast'; 
        d.innerText=msg;
        document.body.appendChild(d); 
        setTimeout(()=>d.remove(), 3000);
    }

    function escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ================== INIT ==================
    function init() {
        loadLibrary();
        
        // Gắn sự kiện cho input file thủ công để đảm bảo hoạt động
        const fileInput = document.getElementById('fileInput');
        if(fileInput) {
            fileInput.addEventListener('change', handleFileUpload);
        }
    }

    // Public API (để gọi từ HTML onclick)
    return {
        init,
        processSmartPaste, 
        saveCurrentQuiz, 
        deleteQuiz, 
        playQuiz, 
        startQuiz: () => prepareQuiz(state.currentQuiz),
        startQuizNow: () => prepareQuiz(state.currentQuiz),
        prevQuestion: () => { if(state.currentIndex>0) {state.currentIndex--; renderQuestion();} },
        nextQuestion: () => { if(state.currentIndex<state.currentQuiz.length-1) {state.currentIndex++; renderQuestion();} },
        goto: (i) => { state.currentIndex=i; renderQuestion(); },
        chooseAnswer, 
        submitQuiz, 
        goHome: () => { loadLibrary(); showScreen('home-screen'); },
        reviewMode: () => {
             alert('Chức năng xem lại đang được cập nhật...');
             // Bạn có thể thêm logic review ở đây nếu cần
        }
    };
})();

// Khởi chạy App khi trang tải xong
window.addEventListener('DOMContentLoaded', () => {
    window.app = App; // Gán vào window để HTML gọi được
    App.init();
});

