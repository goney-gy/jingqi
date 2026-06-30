// ===== API配置 =====
// 根据环境自动选择API地址
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '10.10.21.141'
    ? 'http://localhost:8000/api'
    : 'https://10.10.21.141：8000/api';  // 部署后改为实际地址

// 或者直接指定
// const API_URL = 'http://localhost:8000/api';

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
        notes.forEach(note => {
            state.dailyNotes[note.date] = note;
        });
        
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
function renderCalendar() {
    const year = state.currentYear;
    const month = state.currentMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
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
            const key = d.toISOString().split('T')[0];
            if (key.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) {
                periodDates.add(key);
            }
        }
    });
    
    // 构建日历
    let html = '';
    const totalDays = firstDay + daysInMonth;
    const totalSlots = Math.ceil(totalDays / 7) * 7;
    
    for (let i = 0; i < totalSlots; i++) {
        let day;
        let isOtherMonth = false;
        
        if (i < firstDay) {
            // 上月
            day = daysInPrevMonth - firstDay + i + 1;
            isOtherMonth = true;
        } else if (i >= firstDay + daysInMonth) {
            // 下月
            day = i - firstDay - daysInMonth + 1;
            isOtherMonth = true;
        } else {
            day = i - firstDay + 1;
        }
        
        const dateObj = new Date(year, month, day);
        const dateStr = dateObj.toISOString().split('T')[0];
        const isToday = dateStr === todayStr;
        const isPeriod = periodDates.has(dateStr);
        const hasNote = state.dailyNotes[dateStr];
        
        let classes = 'calendar-day';
        if (isOtherMonth) classes += ' other-month';
        if (isToday) classes += ' today';
        if (isPeriod) classes += ' period-day';
        if (hasNote) classes += ' has-note';
        
        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }
    
    $('calendarGrid').innerHTML = html;
    
    // 添加点击事件
    document.querySelectorAll('.calendar-day:not(.other-month)').forEach(el => {
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            state.selectedDate = new Date(date);
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
    
    // 显示日期信息
    const date = new Date(dateStr);
    const dateDisplay = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`;
    $('noteStatus').textContent = `📅 ${dateDisplay}`;
}

// ===== 保存备注 =====
async function saveDailyNote() {
    const date = state.selectedDate.toISOString().split('T')[0];
    const note = $('dailyNote').value.trim();
    const hasPeriod = $('markPeriod').classList.contains('active');
    
    try {
        await apiCall('/daily_note', 'POST', {
            user_id: state.userId,
            date: date,
            note: note,
            has_period: hasPeriod
        }, true);
        
        // 更新本地状态
        if (!state.dailyNotes[date]) {
            state.dailyNotes[date] = {};
        }
        state.dailyNotes[date].note = note;
        state.dailyNotes[date].has_period = hasPeriod;
        
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
    const date = state.selectedDate.toISOString().split('T')[0];
    const markBtn = $('markPeriod');
    const isActive = markBtn.classList.contains('active');
    
    if (!isActive) {
        // 标记经期开始
        const modal = $('modal');
        const dateDisplay = new Date(date).toLocaleDateString('zh-CN');
        $('modalMessage').textContent = `🌸 是否将 ${dateDisplay} 标记为经期开始日？`;
        modal.classList.add('show');
        
        $('modalConfirm').onclick = async () => {
            modal.classList.remove('show');
            try {
                await apiCall('/record_period', 'POST', {
                    user_id: state.userId,
                    start_date: date,
                    cycle_length: 28,
                    period_length: 5
                }, true);
                
                // 重新加载数据
                await loadData();
                renderCalendar();
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
        // 取消标记（这里简单处理，实际应用中可添加删除功能）
        alert('取消标记功能暂未实现');
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

// ===== 初始化 =====
async function init() {
    // 检查是否有保存的token
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
