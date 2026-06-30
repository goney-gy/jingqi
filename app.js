// ===== API配置 =====
// 使用您的电脑IP地址（手机和电脑需在同一WiFi）
const API_URL = 'http://10.10.21.141:8000/api';

// 打印API地址，方便调试
console.log('📡 API地址:', API_URL);

// ===== 日期工具函数 =====
function formatDate(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayDate(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
}

// ===== 状态管理 =====
let state = {
    currentDate: new Date(),
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    userId: null,
    token: null,
    periods: [],
    dailyNotes: {},
    selectedDate: new Date()
};

// ===== DOM引用 =====
const $ = id => document.getElementById(id);
const pages = {
    login: $('loginPage'),
    register: $('registerPage'),
    app: $('appPage')
};

// ===== API调用 =====
async function apiCall(endpoint, method = 'GET', data = null, auth = false) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (auth && state.token) {
        options.headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, options);
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || '请求失败');
        }
        return result;
    } catch (error) {
        throw error;
    }
}

// ===== 认证 =====
async function login(username, password) {
    try {
        const result = await apiCall('/login', 'POST', { username, password });
        state.token = result.token;
        state.userId = result.user_id;
        localStorage.setItem('token', result.token);
        localStorage.setItem('userId', result.user_id);
        await loadData();
        showPage('app');
        renderCalendar();
        return true;
    } catch (error) {
        alert('登录失败: ' + error.message);
        return false;
    }
}

async function register(username, password, email) {
    try {
        await apiCall('/register', 'POST', { username, password, email });
        alert('注册成功！请登录');
        showPage('login');
        return true;
    } catch (error) {
        alert('注册失败: ' + error.message);
        return false;
    }
}

function logout() {
    state.token = null;
    state.userId = null;
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    showPage('login');
}

// ===== 数据加载 =====
async function loadData() {
    try {
        // 加载经期记录
        const periods = await apiCall('/get_periods', 'GET', null, true);
        state.periods = periods;
        
        // 加载每日备注
        const notes = await apiCall('/get_notes', 'GET', null, true);
        state.dailyNotes = {};
        if (Array.isArray(notes)) {
            notes.forEach(note => {
                state.dailyNotes[note.date] = note;
            });
        } else if (typeof notes === 'object') {
            state.dailyNotes = notes;
        }
        
        // 更新统计
        updateStats();
        
        // 更新历史记录
        renderHistory();
        
        return true;
    } catch (error) {
        console.error('加载数据失败:', error);
        return false;
    }
}

// ===== 渲染日历 =====
async function renderCalendar() {
    const year = state.currentYear;
    const month = state.currentMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
    
    // 更新标题
    $('currentMonthYear').textContent = `${year}年${month + 1}月`;
    
    // 获取经期日期集合
    const periodDates = new Set();
    state.periods.forEach(record => {
        const start = new Date(record.start_date);
        const duration = record.period_length || 5;
        for (let i = 0; i < duration; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const key = formatDate(d.getFullYear(), d.getMonth(), d.getDate());
            if (key.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) {
                periodDates.add(key);
            }
        }
    });
    
    // 获取预测日期
    let predictedDates = new Set();
    try {
        const prediction = await apiCall('/get_cycle_prediction', 'GET', null, true);
        if (prediction && prediction.has_data && prediction.next_start) {
            const nextStart = new Date(prediction.next_start);
            const nextStartStr = formatDate(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate());
            if (nextStartStr.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) {
                predictedDates.add(nextStartStr);
            }
        }
    } catch (error) {
        console.log('获取预测失败:', error);
    }
    
    // 构建日历
    let html = '';
    const totalDays = firstDay + daysInMonth;
    const totalSlots = Math.ceil(totalDays / 7) * 7;
    
    for (let i = 0; i < totalSlots; i++) {
        let day;
        let isOtherMonth = false;
        
        if (i < firstDay) {
            day = daysInPrevMonth - firstDay + i + 1;
            isOtherMonth = true;
        } else if (i >= firstDay + daysInMonth) {
            day = i - firstDay - daysInMonth + 1;
            isOtherMonth = true;
        } else {
            day = i - firstDay + 1;
        }
        
        const dateStr = formatDate(year, month, day);
        const isToday = dateStr === todayStr;
        const isPeriod = periodDates.has(dateStr);
        const isPredicted = predictedDates.has(dateStr);
        const hasNote = state.dailyNotes[dateStr];
        
        let classes = 'calendar-day';
        if (isOtherMonth) classes += ' other-month';
        if (isToday) classes += ' today';
        if (isPeriod) classes += ' period-day';
        if (isPredicted) classes += ' predicted-day';
        if (hasNote && hasNote.note) classes += ' has-note';
        
        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }
    
    $('calendarGrid').innerHTML = html;
    
    // 添加点击事件
    document.querySelectorAll('.calendar-day:not(.other-month)').forEach(el => {
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            const parts = date.split('-');
            state.selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            showDayNote(date);
        });
    });
}

// ===== 显示日期备注 =====
function showDayNote(dateStr) {
    const note = state.dailyNotes[dateStr] || {};
    $('dailyNote').value = note.note || '';
    
    // 更新经期标记按钮
    const markBtn = $('markPeriod');
    if (note.has_period) {
        markBtn.classList.add('active');
        markBtn.textContent = '💖 取消标记';
    } else {
        markBtn.classList.remove('active');
        markBtn.textContent = '💖 标记经期';
    }
    
    // 修复：直接显示正确的日期
    const parts = dateStr.split('-');
    const dateDisplay = `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    $('noteStatus').textContent = `📅 ${dateDisplay}`;
}

// ===== 保存备注 =====
async function saveDailyNote() {
    const date = formatDateFromDate(state.selectedDate);
    const noteText = $('dailyNote').value.trim();
    const hasPeriod = $('markPeriod').classList.contains('active');
    
    // 如果备注为空且没有经期标记，询问是否删除
    if (!noteText && !hasPeriod) {
        const existingNote = state.dailyNotes[date];
        if (existingNote && existingNote.note) {
            if (confirm('确定要删除今天的备注吗？')) {
                try {
                    await apiCall('/daily_note', 'POST', {
                        date: date,
                        note: '',
                        has_period: false,
                        symptoms: '',
                        flow_level: null
                    }, true);
                    
                    delete state.dailyNotes[date];
                    renderCalendar();
                    $('noteStatus').textContent = '🗑️ 备注已删除！';
                    setTimeout(() => $('noteStatus').textContent = '', 2000);
                    return;
                } catch (error) {
                    alert('删除失败: ' + error.message);
                    return;
                }
            }
        }
        return;
    }
    
    try {
        const symptoms = prompt('请输入症状（可选，用逗号分隔）：', '');
        const flowLevel = prompt('请输入流量等级（1-5）：', '3');
        
        await apiCall('/daily_note', 'POST', {
            date: date,
            note: noteText,
            has_period: hasPeriod,
            symptoms: symptoms || '',
            flow_level: flowLevel ? parseInt(flowLevel) : null
        }, true);
        
        // 更新本地状态
        if (!state.dailyNotes[date]) {
            state.dailyNotes[date] = {};
        }
        state.dailyNotes[date].note = noteText;
        state.dailyNotes[date].has_period = hasPeriod;
        state.dailyNotes[date].symptoms = symptoms || '';
        state.dailyNotes[date].flow_level = flowLevel ? parseInt(flowLevel) : null;
        
        $('noteStatus').textContent = '✅ 保存成功！';
        renderCalendar();
        updateStats();
        
        setTimeout(() => {
            $('noteStatus').textContent = '';
        }, 2000);
        
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

// ===== 标记经期 =====
async function markPeriod() {
    const date = formatDateFromDate(state.selectedDate);
    const markBtn = $('markPeriod');
    const isActive = markBtn.classList.contains('active');
    
    if (!isActive) {
        // 标记经期开始
        const modal = $('modal');
        const dateDisplay = displayDate(date);
        $('modalMessage').textContent = `🌸 是否将 ${dateDisplay} 标记为经期开始日？`;
        modal.classList.add('show');
        
        $('modalConfirm').onclick = async () => {
            modal.classList.remove('show');
            try {
                await apiCall('/record_period', 'POST', {
                    start_date: date,
                    cycle_length: 28,
                    period_length: 5
                }, true);
                
                await loadData();
                renderCalendar();
                updateStats();
                $('noteStatus').textContent = '✅ 经期标记成功！';
                setTimeout(() => $('noteStatus').textContent = '', 2000);
            } catch (error) {
                alert('标记失败: ' + error.message);
            }
        };
        
        $('modalCancel').onclick = () => {
            modal.classList.remove('show');
        };
    } else {
        // 取消标记经期
        const dateDisplay = displayDate(date);
        if (confirm(`确定要取消 ${dateDisplay} 的经期标记吗？`)) {
            try {
                await apiCall(`/delete_period/${date}`, 'DELETE', null, true);
                await loadData();
                renderCalendar();
                updateStats();
                
                markBtn.classList.remove('active');
                markBtn.textContent = '💖 标记经期';
                
                const note = state.dailyNotes[date] || {};
                if (note.has_period) {
                    note.has_period = false;
                    await apiCall('/daily_note', 'POST', {
                        date: date,
                        note: note.note || '',
                        has_period: false,
                        symptoms: note.symptoms || '',
                        flow_level: note.flow_level || null
                    }, true);
                }
                
                $('noteStatus').textContent = '✅ 经期标记已取消！';
                setTimeout(() => $('noteStatus').textContent = '', 2000);
            } catch (error) {
                alert('取消标记失败: ' + error.message);
            }
        }
    }
}

// ===== 更新统计 =====
function updateStats() {
    if (state.periods.length === 0) {
        $('cycleLength').textContent = '--';
        $('periodLength').textContent = '--';
        $('nextPeriod').textContent = '--';
        return;
    }
    
    const last = state.periods[0];
    const cycleLength = last.cycle_length || 28;
    const periodLength = last.period_length || 5;
    
    $('cycleLength').textContent = cycleLength;
    $('periodLength').textContent = periodLength;
    
    // 计算下次经期
    const lastStart = new Date(last.start_date);
    const nextStart = new Date(lastStart);
    nextStart.setDate(nextStart.getDate() + cycleLength);
    $('nextPeriod').textContent = nextStart.toLocaleDateString('zh-CN');
}

// ===== 渲染历史记录 =====
function renderHistory() {
    const container = $('periodHistory');
    if (state.periods.length === 0) {
        container.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">暂无记录</p>';
        return;
    }
    
    let html = '';
    state.periods.slice(0, 10).forEach(record => {
        const date = new Date(record.start_date).toLocaleDateString('zh-CN');
        html += `
            <div class="period-item">
                <span class="date">${date}</span>
                <span class="info">周期 ${record.cycle_length}天 · 经期 ${record.period_length}天</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ===== 页面切换 =====
function showPage(page) {
    Object.keys(pages).forEach(key => {
        pages[key].classList.toggle('active', key === page);
    });
}

// ===== 事件绑定 =====
// 登录
$('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value.trim();
    await login(username, password);
});

// 注册
$('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('registerUsername').value.trim();
    const email = $('registerEmail').value.trim();
    const password = $('registerPassword').value;
    const confirm = $('registerConfirmPassword').value;
    
    if (password !== confirm) {
        alert('两次输入的密码不一致');
        return;
    }
    if (password.length < 6) {
        alert('密码长度至少6位');
        return;
    }
    await register(username, password, email);
});

// 切换登录/注册
$('showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('register');
});

$('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('login');
});

// 退出
$('logoutBtn').addEventListener('click', logout);

// 日历导航
$('prevMonth').addEventListener('click', () => {
    state.currentMonth--;
    if (state.currentMonth < 0) {
        state.currentMonth = 11;
        state.currentYear--;
    }
    renderCalendar();
});

$('nextMonth').addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 11) {
        state.currentMonth = 0;
        state.currentYear++;
    }
    renderCalendar();
});

// 保存备注
$('saveNote').addEventListener('click', saveDailyNote);

// 标记经期
$('markPeriod').addEventListener('click', markPeriod);

// 删除备注
$('deleteNote').addEventListener('click', async () => {
    const date = formatDateFromDate(state.selectedDate);
    const existingNote = state.dailyNotes[date];
    if (!existingNote || !existingNote.note) {
        alert('该日期没有备注需要删除');
        return;
    }
    
    if (confirm(`确定要删除 ${displayDate(date)} 的备注吗？`)) {
        try {
            await apiCall('/daily_note', 'POST', {
                date: date,
                note: '',
                has_period: false,
                symptoms: '',
                flow_level: null
            }, true);
            
            delete state.dailyNotes[date];
            $('dailyNote').value = '';
            renderCalendar();
            $('noteStatus').textContent = '🗑️ 备注已删除！';
            setTimeout(() => $('noteStatus').textContent = '', 2000);
        } catch (error) {
            alert('删除失败: ' + error.message);
        }
    }
});

// ===== 初始化 =====
async function init() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    
    if (token && userId) {
        state.token = token;
        state.userId = userId;
        try {
            await loadData();
            showPage('app');
            renderCalendar();
            return;
        } catch (error) {
            console.error('自动登录失败:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
        }
    }
    
    showPage('login');
}

init();
