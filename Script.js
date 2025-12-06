const App = (function() {
    // Cấu hình API Vercel
    const API_URL = '/api/quizzes';

    // State
    const state = {
        library: [],
        currentQuiz: [],
        originalQuiz: [],
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
            badge.innerText = 'Đang tải...';
            // Gọi Vercel Function
            const res = await fetch(API_URL);
            
            if (!res.ok) throw new Error('Chưa kết nối API hoặc Lỗi Server');
            
            const data = await res.json();
            state.library = data;
            
            renderLibrary();
            badge.innerText = `${data.length} đề`;
        } catch (e) {
            console.error(e);
            list.innerHTML = `<div style="text-align:center; color:red; padding:10px;">
                ⚠️ Không thể kết nối MongoDB.<br>
                <small>Hãy chắc chắn bạn đã tạo file <b>api/quizzes.js</b> và cấu hình ENV trên Vercel.</small>
            </div>`;
            badge.innerText = 'Lỗi';
        }
    }

    async function saveCurrentQuiz() {
        if (state.currentQuiz.length === 0) return alert('Không có câu hỏi!');
        
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
            showToast('❌ Lỗi: ' + e.message);
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
            
            // Nạp dữ liệu vào Game
            state.originalQuiz = data.questions;
            prepareQuiz(state.originalQuiz);
            
            showToast(`🚀 Bắt đầu: ${data.name}`);
        } catch (e) { showToast('❌ Lỗi tải đề'); }
    }

    function renderLibrary() {
        const list = document.getElementById('quizList');
        if (state.library.length === 0) {
            list.innerHTML = '<p style="text-align:center; width:100%; color:#666;">Chưa có đề nào.</p>';
            return;
        }
        list.innerHTML = state.library.map(q => `
            <div class="quiz-card">
                <div>
                    <h4>${escape(q.name)}</h4>
                    <div class="meta">📅 ${new Date(q.createdAt).toLocaleDateString()} • 📊 ${q.count} câu</div>
                </div>
                <div class="card-actions">
                    <button class="card-btn btn-play" onclick="app.playQuiz('${q._id}')">▶️ Làm bài</button>
                    <button class="card-btn btn-del" onclick="app.deleteQuiz('${q._id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    // ================== 2. XỬ LÝ FILE (LOCAL) ==================

    function processSmartPaste() {
        const text = document.getElementById('smartPasteInput').value;
        const questions = parseQuestions(text);
        if (questions.length > 0) {
            state.currentQuiz = questions;
            // Hiện nút lưu
            document.getElementById('saveActionSection').style.display = 'block';
            showToast(`✅ Tìm thấy ${questions.length} câu hỏi`);
        } else {
            showToast('❌ Không tìm thấy câu hỏi nào');
        }
    }

    // Logic tách câu hỏi (Regex tối ưu)
    function parseQuestions(text) {
        text = text.replace(/([^\n])\s+([A-D][\.\)])/g, "$1\n$2");
        const blocks = text.split(/\n(?=(?:Câu|Bài|Question)\s*\d+[:\.]|\d+[\.\)])/i).filter(b => b.trim());
        
        return blocks.map((block, idx) => {
            const lines = block.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length < 2) return null;
            const qText = lines[0].replace(/^(Câu|Bài|Question)?\s*\d+[:\.\)]\s*/i, '');
            const answers = [];
            let correct = 0;
            
            lines.slice(1).forEach(line => {
                const isCorrect = line.startsWith('*');
                const clean = line.replace(/^[\*\-\+]?\s*[A-D][\.\)]\s*/i, '').trim();
                if (clean) {
                    answers.push(clean);
                    if (isCorrect) correct = answers.length - 1;
                }
            });
            return answers.length >= 2 ? { id: idx, question: qText, answers, correct } : null;
        }).filter(Boolean);
    }

    // ================== 3. LOGIC GAME (QUIZ) ==================

    function prepareQuiz(questions) {
        // Cài đặt
        const timeInput = document.getElementById('timeLimit').value;
        const shuffle = document.getElementById('shuffleToggle').checked;
        
        state.settings.timeLimit = parseInt(timeInput);
        state.currentQuiz = JSON.parse(JSON.stringify(questions));
        
        if (shuffle) state.currentQuiz.sort(() => Math.random() - 0.5);
        
        // Reset
        state.currentIndex = 0;
        state.answers = new Array(state.currentQuiz.length).fill(null);
        state.timeLeft = state.settings.timeLimit * 60;
        
        // UI
        showScreen('quiz-screen');
        renderQuestion();
        startTimer();
    }

    function renderQuestion() {
        const q = state.currentQuiz[state.currentIndex];
        document.getElementById('currentQ').innerText = state.currentIndex + 1;
        document.getElementById('totalQ').innerText = state.currentQuiz.length;
        
        const qText = document.getElementById('questionText');
        qText.innerHTML = q.question;
        renderMathInElement(qText); // LaTeX
        
        const container = document.getElementById('answersContainer');
        container.innerHTML = q.answers.map((ans, idx) => `
            <div class="answer-opt ${state.answers[state.currentIndex] === idx ? 'selected' : ''}" 
                 onclick="app.chooseAnswer(${idx})">
                 ${ans}
            </div>
        `).join('');
        renderMathInElement(container);

        // Nút điều hướng
        document.getElementById('nextBtn').style.display = state.currentIndex === state.currentQuiz.length - 1 ? 'none' : 'block';
        document.getElementById('submitBtn').style.display = state.currentIndex === state.currentQuiz.length - 1 ? 'block' : 'none';
        
        renderNav();
    }

    function chooseAnswer(idx) {
        state.answers[state.currentIndex] = idx;
        renderQuestion();
    }

    function submitQuiz() {
        clearInterval(state.timer);
        let correct = 0;
        state.currentQuiz.forEach((q, i) => {
            if (state.answers[i] === q.correct) correct++;
        });
        
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
            display.innerText = `${m}:${s}`;
            if(state.timeLeft <= 0) submitQuiz();
        }, 1000);
    }
    
    function renderNav() {
        const nav = document.getElementById('questionNav');
        nav.innerHTML = state.answers.map((a, i) => 
            `<div class="nav-item ${a!==null?'done':''}" onclick="app.goto(${i})">${i+1}</div>`
        ).join('');
    }

    function showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.querySelector('.' + name).classList.add('active');
    }

    function showToast(msg) {
        const d = document.createElement('div'); d.className='toast'; d.innerText=msg;
        document.body.appendChild(d); setTimeout(()=>d.remove(), 3000);
    }

    function escape(s) { return s ? s.replace(/</g, "&lt;") : ''; }

    // Init
    window.onload = () => {
        loadLibrary();
        // File Upload Listener
        document.getElementById('fileInput').addEventListener('change', (e) => {
            const f = e.target.files[0];
            if(!f) return;
            document.getElementById('fileName').innerText = f.name;
            if(f.name.endsWith('.docx')) {
                mammoth.extractRawText({arrayBuffer: f}).then(res => {
                    document.getElementById('smartPasteInput').value = res.value;
                    processSmartPaste();
                });
            }
        });
    };

    return {
        processSmartPaste, saveCurrentQuiz, deleteQuiz, playQuiz, startQuiz: () => prepareQuiz(state.currentQuiz),
        startQuizNow: () => prepareQuiz(state.currentQuiz),
        prevQuestion: () => { if(state.currentIndex>0) {state.currentIndex--; renderQuestion();} },
        nextQuestion: () => { if(state.currentIndex<state.currentQuiz.length-1) {state.currentIndex++; renderQuestion();} },
        goto: (i) => { state.currentIndex=i; renderQuestion(); },
        chooseAnswer, submitQuiz, goHome: () => { loadLibrary(); showScreen('home-screen'); },
        reviewMode: () => alert('Tính năng đang phát triển')
    };
})();

window.app = App;

