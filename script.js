// 🔒 تهيئة Firebase
const firebaseConfig = {
    apiKey: "AIzaSyChUu7Qp9BhbQ5VRWLt3eJucTWA9DjrLQ4",
    authDomain: "taskflow-f16b4.firebaseapp.com",
    projectId: "taskflow-f16b4",
    storageBucket: "taskflow-f16b4.firebasestorage.app",
    messagingSenderId: "760837727092",
    appId: "1:760837727092:web:dd21201a21d7c145b08221",
    measurementId: "G-3NPZQHMBF4"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// بيانات التطبيق
let currentUser = null;
let tasks = [];
let habits = [];
let achievements = [];
let currentTheme = localStorage.getItem('theme') || 'light';
let focusTimer = null;
let focusTimeLeft = 25 * 60; // 25 دقيقة بالثواني
let isFocusRunning = false;
let completedSessions = 0;
let totalFocusTime = 0;

// المخططات
let completionChart, priorityChart, productivityChart, categoryChart;

// 🔒 وظائف الأمان
function sanitizeInput(input) {
    if (!input) return '';
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

// 🔐 نظام المصادقة
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        
        // التحقق إذا كان الملف الشخصي مكتمل
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists && userDoc.data().profileCompleted) {
            showMainScreen();
            await loadUserData();
            updateUserAvatar();
        } else {
            showProfileModal();
        }
    } else {
        showAuthScreen();
    }
});

// تسجيل الدخول
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');

    if (!validateEmail(email)) {
        showNotification('البريد الإلكتروني غير صالح', 'error');
        return;
    }

    if (!validatePassword(password)) {
        showNotification('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
        return;
    }

    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسجيل...';
    loginBtn.disabled = true;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        showNotification('تم تسجيل الدخول بنجاح!', 'success');
    } catch (error) {
        showNotification(`خطأ في التسجيل: ${error.message}`, 'error');
    } finally {
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> تسجيل الدخول';
        loginBtn.disabled = false;
    }
});

// إنشاء حساب جديد
document.getElementById('showRegister').addEventListener('click', () => {
    document.getElementById('registerModal').style.display = 'flex';
});

document.getElementById('closeRegister').addEventListener('click', () => {
    document.getElementById('registerModal').style.display = 'none';
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const registerBtn = document.getElementById('registerBtn');

    if (!validateEmail(email)) {
        showNotification('البريد الإلكتروني غير صالح', 'error');
        return;
    }

    if (!validatePassword(password)) {
        showNotification('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showNotification('كلمة المرور غير متطابقة', 'error');
        return;
    }

    registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الحساب...';
    registerBtn.disabled = true;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // حفظ البيانات الأساسية للمستخدم
        await db.collection('users').doc(user.uid).set({
            name: sanitizeInput(name),
            email: email,
            profileCompleted: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            streak: {
                current: 0,
                longest: 0,
                lastUpdate: null
            },
            focusStats: {
                sessions: 0,
                totalMinutes: 0
            }
        });

        document.getElementById('registerModal').style.display = 'none';
        document.getElementById('registerForm').reset();
        showNotification('تم إنشاء الحساب بنجاح!', 'success');
        
    } catch (error) {
        showNotification(`خطأ في إنشاء الحساب: ${error.message}`, 'error');
    } finally {
        registerBtn.innerHTML = '<i class="fas fa-user-plus"></i> إنشاء حساب';
        registerBtn.disabled = false;
    }
});

// تسجيل الدخول بـ Google
document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // التحقق إذا كان المستخدم جديد
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            // حفظ بيانات المستخدم من Google
            await db.collection('users').doc(user.uid).set({
                name: user.displayName || 'مستخدم',
                email: user.email,
                profileCompleted: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                streak: {
                    current: 0,
                    longest: 0,
                    lastUpdate: null
                },
                focusStats: {
                    sessions: 0,
                    totalMinutes: 0
                }
            });
        }
        showNotification('تم تسجيل الدخول بنجاح!', 'success');
    } catch (error) {
        showNotification(`خطأ في التسجيل بـ Google: ${error.message}`, 'error');
    }
});

// إكمال الملف الشخصي
document.getElementById('profileUserType').addEventListener('change', function() {
    const userType = this.value;
    document.getElementById('highschoolFields').style.display = userType === 'highschool' ? 'block' : 'none';
    document.getElementById('collegeFields').style.display = userType === 'college' ? 'block' : 'none';
});

document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userType = document.getElementById('profileUserType').value;
    const birthdate = document.getElementById('profileBirthdate').value;
    
    let profileData = {
        profileCompleted: true,
        userType: userType,
        birthdate: birthdate,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // إضافة بيانات إضافية حسب نوع المستخدم
    if (userType === 'highschool') {
        profileData.section = document.getElementById('profileSection').value;
    } else if (userType === 'college') {
        profileData.college = sanitizeInput(document.getElementById('profileCollege').value);
        profileData.major = sanitizeInput(document.getElementById('profileMajor').value);
        profileData.year = document.getElementById('profileYear').value;
    }

    try {
        await db.collection('users').doc(currentUser.uid).update(profileData);
        document.getElementById('profileModal').style.display = 'none';
        showMainScreen();
        await loadUserData();
        updateUserAvatar();
        showNotification('تم حفظ الملف الشخصي بنجاح!', 'success');
    } catch (error) {
        showNotification('حدث خطأ أثناء حفظ البيانات', 'error');
    }
});

// 🎨 نظام الوضع الليلي/النهاري
function initTheme() {
    document.body.setAttribute('data-theme', currentTheme);
    const themeIcon = document.querySelector('#themeToggle i');
    themeIcon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

document.getElementById('themeToggle').addEventListener('click', function() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    
    const themeIcon = this.querySelector('i');
    themeIcon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
});

// 🔍 نظام البحث
document.getElementById('searchToggle').addEventListener('click', function() {
    const searchBar = document.getElementById('searchBar');
    searchBar.style.display = searchBar.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('searchInput').addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    filterTasks(searchTerm);
});

function filterTasks(searchTerm) {
    const filteredTasks = tasks.filter(task => 
        task.title.toLowerCase().includes(searchTerm) ||
        (task.description && task.description.toLowerCase().includes(searchTerm))
    );
    displayTasks(filteredTasks);
}

// 📊 إدارة المهام
async function loadUserData() {
    await loadUserTasks();
    await loadUserHabits();
    await loadUserAchievements();
    await loadUserStats();
    initCharts();
}

async function loadUserTasks() {
    if (!currentUser) return;

    try {
        const snapshot = await db.collection('tasks')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();

        tasks = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        displayTasks();
        updateStats();
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('حدث خطأ في تحميل المهام', 'error');
    }
}

async function addTask(taskData) {
    if (!currentUser) return;

    try {
        const task = {
            ...taskData,
            userId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            completed: false
        };

        await db.collection('tasks').add(task);
        
        // إعادة تحميل المهام وعرضها مباشرة
        await loadUserTasks();
        await updateStreak();
        
        // إظهار رسالة نجاح
        showNotification('تم إضافة المهمة بنجاح!', 'success');
    } catch (error) {
        console.error('Error adding task:', error);
        showNotification('حدث خطأ أثناء إضافة المهمة', 'error');
    }
}

function displayTasks(tasksToDisplay = tasks) {
    const tasksList = document.getElementById('tasksList');
    
    if (tasksToDisplay.length === 0) {
        tasksList.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <i class="fas fa-tasks" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>لا توجد مهام حالياً. ابدأ بإضافة مهمة جديدة!</p>
            </div>
        `;
        return;
    }

    tasksList.innerHTML = tasksToDisplay.map(task => `
        <div class="task-card" data-task-id="${task.id}">
            <div class="task-header">
                <h3 class="task-title">${sanitizeInput(task.title)}</h3>
                <span class="task-priority priority-${task.priority}">
                    ${task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                </span>
            </div>
            
            ${task.description ? `<p style="margin-bottom: 1rem; color: var(--text-secondary); line-height: 1.5;">${sanitizeInput(task.description)}</p>` : ''}
            
            <div class="task-meta">
                <div class="task-date">
                    <i class="far fa-calendar"></i>
                    ${new Date(task.date).toLocaleDateString('ar-EG')}
                </div>
                <div class="task-category">
                    <i class="fas fa-${getCategoryIcon(task.category)}"></i>
                    ${getCategoryName(task.category)}
                </div>
            </div>
            
            <div class="task-actions">
                <button class="action-btn complete-btn" onclick="toggleTask('${task.id}')">
                    <i class="fas fa-check"></i>
                </button>
                <button class="action-btn focus-btn" onclick="startFocusSession('${task.id}')">
                    <i class="fas fa-crosshairs"></i>
                </button>
                <button class="action-btn edit-btn" onclick="editTask('${task.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete-btn" onclick="deleteTask('${task.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function getCategoryIcon(category) {
    const icons = {
        'study': 'graduation-cap',
        'work': 'briefcase',
        'personal': 'user',
        'health': 'heartbeat',
        'other': 'tasks'
    };
    return icons[category] || 'tasks';
}

function getCategoryName(category) {
    const names = {
        'study': 'مذاكرة',
        'work': 'عمل',
        'personal': 'شخصي',
        'health': 'صحة',
        'other': 'أخرى'
    };
    return names[category] || 'أخرى';
}

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(task => task.completed).length;
    const pending = tasks.filter(task => !task.completed).length;
    const overdue = tasks.filter(task => !task.completed && new Date(task.date) < new Date()).length;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('completedTasks').textContent = completed;
    document.getElementById('pendingTasks').textContent = pending;
    document.getElementById('overdueTasks').textContent = overdue;
}

async function updateStreak() {
    if (!currentUser) return;

    const today = new Date().toDateString();
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data();
    const lastUpdate = userData.streak?.lastUpdate;
    
    let newStreak = userData.streak?.current || 0;
    let longestStreak = userData.streak?.longest || 0;

    if (lastUpdate) {
        const lastUpdateDate = lastUpdate.toDate().toDateString();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastUpdateDate === yesterday.toDateString()) {
            // استمرار السلسلة
            newStreak++;
        } else if (lastUpdateDate !== today) {
            // كسر السلسلة
            newStreak = 1;
        }
    } else {
        newStreak = 1;
    }

    if (newStreak > longestStreak) {
        longestStreak = newStreak;
    }

    await db.collection('users').doc(currentUser.uid).update({
        'streak.current': newStreak,
        'streak.longest': longestStreak,
        'streak.lastUpdate': firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('currentStreak').textContent = newStreak;
    document.getElementById('longestStreak').textContent = longestStreak;
}

async function loadUserStats() {
    if (!currentUser) return;

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        document.getElementById('currentStreak').textContent = userData.streak?.current || 0;
        document.getElementById('longestStreak').textContent = userData.streak?.longest || 0;
        
        completedSessions = userData.focusStats?.sessions || 0;
        totalFocusTime = userData.focusStats?.totalMinutes || 0;
        
        document.getElementById('completedSessions').textContent = completedSessions;
        document.getElementById('totalFocusTime').textContent = totalFocusTime;
    }
}

// 🎯 نظام العادات
async function loadUserHabits() {
    if (!currentUser) return;

    try {
        const snapshot = await db.collection('habits')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();

        habits = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        displayHabits();
    } catch (error) {
        console.error('Error loading habits:', error);
        showNotification('حدث خطأ في تحميل العادات', 'error');
    }
}

async function addHabit(habitData) {
    if (!currentUser) return;

    try {
        const habit = {
            ...habitData,
            userId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            currentStreak: 0,
            longestStreak: 0,
            completedToday: false
        };

        await db.collection('habits').add(habit);
        await loadUserHabits();
        showNotification('تم إضافة العادة بنجاح!', 'success');
    } catch (error) {
        console.error('Error adding habit:', error);
        showNotification('حدث خطأ أثناء إضافة العادة', 'error');
    }
}

function displayHabits() {
    const habitsList = document.getElementById('habitsList');
    
    if (habits.length === 0) {
        habitsList.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary); grid-column: 1 / -1;">
                <i class="fas fa-redo" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>لا توجد عادات حالياً. ابدأ بإضافة عادة جديدة!</p>
            </div>
        `;
        return;
    }

    habitsList.innerHTML = habits.map(habit => `
        <div class="habit-card">
            <div class="habit-icon">
                <i class="fas fa-${getHabitIcon(habit.category)}"></i>
            </div>
            <div class="habit-name">${sanitizeInput(habit.name)}</div>
            <div class="habit-streak">
                <span class="stat-number">${habit.currentStreak}</span> يوم متتالي
            </div>
            <div class="habit-actions">
                <button class="btn btn-success" onclick="completeHabit('${habit.id}')" ${habit.completedToday ? 'disabled' : ''}>
                    <i class="fas fa-check"></i>
                    ${habit.completedToday ? 'مكتمل' : 'إكمال'}
                </button>
                <button class="btn btn-secondary" onclick="deleteHabit('${habit.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function getHabitIcon(category) {
    const icons = {
        'health': 'heartbeat',
        'study': 'graduation-cap',
        'productivity': 'rocket',
        'personal': 'user',
        'other': 'star'
    };
    return icons[category] || 'star';
}

async function completeHabit(habitId) {
    try {
        const habit = habits.find(h => h.id === habitId);
        if (!habit) return;

        const today = new Date().toDateString();
        const lastCompleted = habit.lastCompleted ? habit.lastCompleted.toDate().toDateString() : null;
        
        let newStreak = habit.currentStreak;
        let longestStreak = habit.longestStreak;

        if (lastCompleted === today) {
            showNotification('لقد أكملت هذه العادة اليوم بالفعل!', 'info');
            return;
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastCompleted === yesterday.toDateString()) {
            newStreak++;
        } else if (lastCompleted !== today) {
            newStreak = 1;
        }

        if (newStreak > longestStreak) {
            longestStreak = newStreak;
        }

        await db.collection('habits').doc(habitId).update({
            currentStreak: newStreak,
            longestStreak: longestStreak,
            lastCompleted: firebase.firestore.FieldValue.serverTimestamp(),
            completedToday: true
        });

        await loadUserHabits();
        checkAchievements();
        showNotification('تم إكمال العادة بنجاح!', 'success');
    } catch (error) {
        console.error('Error completing habit:', error);
        showNotification('حدث خطأ أثناء إكمال العادة', 'error');
    }
}

async function deleteHabit(habitId) {
    if (confirm('هل أنت متأكد من حذف هذه العادة؟')) {
        try {
            await db.collection('habits').doc(habitId).delete();
            await loadUserHabits();
            showNotification('تم حذف العادة بنجاح!', 'success');
        } catch (error) {
            console.error('Error deleting habit:', error);
            showNotification('حدث خطأ أثناء حذف العادة', 'error');
        }
    }
}

// 🏆 نظام الإنجازات
async function loadUserAchievements() {
    // الإنجازات الأساسية
    achievements = [
        {
            id: 'first_task',
            name: 'البداية',
            description: 'أضف أول مهمة',
            icon: 'flag',
            unlocked: tasks.length > 0
        },
        {
            id: 'task_master',
            name: 'سيد المهام',
            description: 'أكمل 10 مهام',
            icon: 'tasks',
            unlocked: tasks.filter(t => t.completed).length >= 10
        },
        {
            id: 'streak_7',
            name: 'منتظم',
            description: 'سلسلة 7 أيام متتالية',
            icon: 'fire',
            unlocked: parseInt(document.getElementById('currentStreak').textContent) >= 7
        },
        {
            id: 'habit_builder',
            name: 'باني العادات',
            description: 'أنشئ 5 عادات',
            icon: 'redo',
            unlocked: habits.length >= 5
        },
        {
            id: 'focus_master',
            name: 'سيد التركيز',
            description: 'أكمل 10 جلسات تركيز',
            icon: 'crosshairs',
            unlocked: completedSessions >= 10
        }
    ];

    displayAchievements();
}

function displayAchievements() {
    const achievementsList = document.getElementById('achievementsList');
    
    achievementsList.innerHTML = achievements.map(achievement => `
        <div class="achievement-card ${achievement.unlocked ? '' : 'locked'}">
            <div class="achievement-icon">
                <i class="fas fa-${achievement.icon}"></i>
            </div>
            <div class="achievement-name">${achievement.name}</div>
            <div class="achievement-desc">${achievement.description}</div>
        </div>
    `).join('');
}

function checkAchievements() {
    // تحديث حالة الإنجازات
    achievements[0].unlocked = tasks.length > 0;
    achievements[1].unlocked = tasks.filter(t => t.completed).length >= 10;
    achievements[2].unlocked = parseInt(document.getElementById('currentStreak').textContent) >= 7;
    achievements[3].unlocked = habits.length >= 5;
    achievements[4].unlocked = completedSessions >= 10;
    
    displayAchievements();
}

// 📈 نظام الرسوم البيانية
function initCharts() {
    // مخطط إنجاز المهام
    const completionCtx = document.getElementById('completionChart').getContext('2d');
    completionChart = new Chart(completionCtx, {
        type: 'doughnut',
        data: {
            labels: ['مكتملة', 'قيد التنفيذ', 'متأخرة'],
            datasets: [{
                data: [
                    tasks.filter(t => t.completed).length,
                    tasks.filter(t => !t.completed && new Date(t.date) >= new Date()).length,
                    tasks.filter(t => !t.completed && new Date(t.date) < new Date()).length
                ],
                backgroundColor: [
                    '#10b981',
                    '#f59e0b',
                    '#ef4444'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    rtl: true
                }
            }
        }
    });

    // مخطط توزيع الأولوية
    const priorityCtx = document.getElementById('priorityChart').getContext('2d');
    priorityChart = new Chart(priorityCtx, {
        type: 'pie',
        data: {
            labels: ['عالية', 'متوسطة', 'منخفضة'],
            datasets: [{
                data: [
                    tasks.filter(t => t.priority === 'high').length,
                    tasks.filter(t => t.priority === 'medium').length,
                    tasks.filter(t => t.priority === 'low').length
                ],
                backgroundColor: [
                    '#ef4444',
                    '#f59e0b',
                    '#10b981'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    rtl: true
                }
            }
        }
    });

    // مخطط الإنتاجية الأسبوعية
    const productivityCtx = document.getElementById('productivityChart').getContext('2d');
    const weekDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const weeklyData = Array(7).fill(0);
    
    tasks.forEach(task => {
        if (task.completed && task.completedAt) {
            const day = new Date(task.completedAt.toDate()).getDay();
            weeklyData[day]++;
        }
    });

    productivityChart = new Chart(productivityCtx, {
        type: 'bar',
        data: {
            labels: weekDays,
            datasets: [{
                label: 'المهام المكتملة',
                data: weeklyData,
                backgroundColor: '#ec4899'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // مخطط توزيع الفئات
    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
    const categories = ['مذاكرة', 'عمل', 'شخصي', 'صحة', 'أخرى'];
    const categoryData = categories.map(cat => 
        tasks.filter(t => getCategoryName(t.category) === cat).length
    );

    categoryChart = new Chart(categoryCtx, {
        type: 'polarArea',
        data: {
            labels: categories,
            datasets: [{
                data: categoryData,
                backgroundColor: [
                    '#ec4899',
                    '#8b5cf6',
                    '#10b981',
                    '#f59e0b',
                    '#64748b'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    rtl: true
                }
            }
        }
    });
}

// 🎯 وضع التركيز
function startFocusSession(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('focusTaskTitle').textContent = task.title;
    document.getElementById('focusMode').style.display = 'flex';
    focusTimeLeft = 25 * 60; // 25 دقيقة
    updateFocusTimer();
}

document.getElementById('startFocus').addEventListener('click', function() {
    if (!isFocusRunning) {
        startFocusTimer();
        this.style.display = 'none';
        document.getElementById('pauseFocus').style.display = 'inline-flex';
    }
});

document.getElementById('pauseFocus').addEventListener('click', function() {
    if (isFocusRunning) {
        pauseFocusTimer();
        this.style.display = 'none';
        document.getElementById('startFocus').style.display = 'inline-flex';
    }
});

document.getElementById('resetFocus').addEventListener('click', function() {
    resetFocusTimer();
    document.getElementById('startFocus').style.display = 'inline-flex';
    document.getElementById('pauseFocus').style.display = 'none';
});

document.getElementById('exitFocus').addEventListener('click', function() {
    exitFocusMode();
});

function startFocusTimer() {
    isFocusRunning = true;
    focusTimer = setInterval(() => {
        focusTimeLeft--;
        updateFocusTimer();
        
        if (focusTimeLeft <= 0) {
            completeFocusSession();
        }
    }, 1000);
}

function pauseFocusTimer() {
    isFocusRunning = false;
    clearInterval(focusTimer);
}

function resetFocusTimer() {
    pauseFocusTimer();
    focusTimeLeft = 25 * 60;
    updateFocusTimer();
}

function exitFocusMode() {
    pauseFocusTimer();
    document.getElementById('focusMode').style.display = 'none';
}

function updateFocusTimer() {
    const minutes = Math.floor(focusTimeLeft / 60);
    const seconds = focusTimeLeft % 60;
    document.getElementById('focusTimer').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function completeFocusSession() {
    pauseFocusTimer();
    completedSessions++;
    totalFocusTime += 25; // 25 دقيقة لكل جلسة
    
    document.getElementById('completedSessions').textContent = completedSessions;
    document.getElementById('totalFocusTime').textContent = totalFocusTime;

    // حفظ الإحصائيات في Firebase
    if (currentUser) {
        await db.collection('users').doc(currentUser.uid).update({
            'focusStats.sessions': completedSessions,
            'focusStats.totalMinutes': totalFocusTime
        });
    }

    showNotification('🎉 مبروك! لقد أكملت جلسة التركيز بنجاح', 'success');
    checkAchievements();
}

// 📝 نماذج إضافة المهام والعادات
document.getElementById('addTaskBtn').addEventListener('click', () => {
    document.getElementById('taskFormModal').style.display = 'flex';
});

document.getElementById('addHabitBtn').addEventListener('click', () => {
    document.getElementById('habitFormModal').style.display = 'flex';
});

document.getElementById('closeTaskForm').addEventListener('click', () => {
    document.getElementById('taskFormModal').style.display = 'none';
});

document.getElementById('closeHabitForm').addEventListener('click', () => {
    document.getElementById('habitFormModal').style.display = 'none';
});

// نظام التكرار
document.querySelectorAll('.repeat-option').forEach(option => {
    option.addEventListener('click', function() {
        document.querySelectorAll('.repeat-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        this.classList.add('selected');
        document.getElementById('taskRepeat').value = this.dataset.value;
    });
});

document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const taskData = {
        title: sanitizeInput(document.getElementById('taskTitle').value),
        description: sanitizeInput(document.getElementById('taskDescription').value),
        date: document.getElementById('taskDate').value,
        time: document.getElementById('taskTime').value,
        category: document.getElementById('taskCategory').value,
        priority: document.getElementById('taskPriority').value,
        repeat: document.getElementById('taskRepeat').value,
        reminder: document.getElementById('taskReminder').checked
    };

    await addTask(taskData);
    document.getElementById('taskFormModal').style.display = 'none';
    document.getElementById('taskForm').reset();
});

document.getElementById('habitForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const habitData = {
        name: sanitizeInput(document.getElementById('habitName').value),
        description: sanitizeInput(document.getElementById('habitDescription').value),
        category: document.getElementById('habitCategory').value,
        frequency: document.getElementById('habitFrequency').value,
        goal: parseInt(document.getElementById('habitGoal').value)
    };

    await addHabit(habitData);
    document.getElementById('habitFormModal').style.display = 'none';
    document.getElementById('habitForm').reset();
});

// 🖼️ إدارة الواجهة
function showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainScreen').style.display = 'none';
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'none';
}

function showMainScreen() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'none';
}

function showProfileModal() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'none';
    document.getElementById('profileModal').style.display = 'flex';
}

function updateUserAvatar() {
    if (currentUser && currentUser.photoURL) {
        document.getElementById('userAvatar').innerHTML = `<img src="${currentUser.photoURL}" alt="صورة المستخدم" style="width: 100%; height: 100%; border-radius: 50%;">`;
    } else if (currentUser && currentUser.email) {
        const initial = currentUser.email[0].toUpperCase();
        document.getElementById('userAvatar').textContent = initial;
    }
}

// نظام التبويبات
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        // إزالة النشاط من جميع التبويبات
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // إضافة النشاط للتبويب المحدد
        this.classList.add('active');
        const tabId = this.dataset.tab + 'Tab';
        document.getElementById(tabId).classList.add('active');
    });
});

// 🎯 وظائف إضافية للمهام
async function toggleTask(taskId) {
    try {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        await db.collection('tasks').doc(taskId).update({
            completed: !task.completed,
            completedAt: task.completed ? null : firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await loadUserTasks();
        await updateStreak();
        checkAchievements();
        
        showNotification(task.completed ? 'تم إلغاء إكمال المهمة' : 'تم إكمال المهمة بنجاح!', 'success');
    } catch (error) {
        console.error('Error toggling task:', error);
        showNotification('حدث خطأ أثناء تحديث المهمة', 'error');
    }
}

async function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // تعبئة النموذج ببيانات المهمة
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskDate').value = task.date;
    document.getElementById('taskTime').value = task.time || '';
    document.getElementById('taskCategory').value = task.category;
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskRepeat').value = task.repeat || 'none';
    document.getElementById('taskReminder').checked = task.reminder || false;

    // تحديث خيارات التكرار
    document.querySelectorAll('.repeat-option').forEach(opt => {
        opt.classList.remove('selected');
        if (opt.dataset.value === (task.repeat || 'none')) {
            opt.classList.add('selected');
        }
    });

    // فتح نموذج التعديل
    document.getElementById('taskFormModal').style.display = 'flex';
    
    // تغيير سلوك النموذج للتعديل بدلاً من الإضافة
    const form = document.getElementById('taskForm');
    const originalSubmit = form.onsubmit;
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const updatedTask = {
            title: sanitizeInput(document.getElementById('taskTitle').value),
            description: sanitizeInput(document.getElementById('taskDescription').value),
            date: document.getElementById('taskDate').value,
            time: document.getElementById('taskTime').value,
            category: document.getElementById('taskCategory').value,
            priority: document.getElementById('taskPriority').value,
            repeat: document.getElementById('taskRepeat').value,
            reminder: document.getElementById('taskReminder').checked,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('tasks').doc(taskId).update(updatedTask);
            await loadUserTasks();
            document.getElementById('taskFormModal').style.display = 'none';
            form.reset();
            form.onsubmit = originalSubmit;
            showNotification('تم تحديث المهمة بنجاح!', 'success');
        } catch (error) {
            console.error('Error updating task:', error);
            showNotification('حدث خطأ أثناء تحديث المهمة', 'error');
        }
    };
}

async function deleteTask(taskId) {
    if (confirm('هل أنت متأكد من حذف هذه المهمة؟')) {
        try {
            await db.collection('tasks').doc(taskId).delete();
            await loadUserTasks();
            showNotification('تم حذف المهمة بنجاح!', 'success');
        } catch (error) {
            console.error('Error deleting task:', error);
            showNotification('حدث خطأ أثناء حذف المهمة', 'error');
        }
    }
}

// دالة إظهار الإشعارات
function showNotification(message, type = 'info') {
    // إنشاء عنصر الإشعار
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
    `;
    
    // تحديد اللون حسب النوع
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#8b5cf6',
        warning: '#f59e0b'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;
    
    // إضافة الإشعار إلى الصفحة
    document.body.appendChild(notification);
    
    // إزالة الإشعار بعد 3 ثواني
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 📋 نظام القوالب
function loadTemplate(templateType) {
    let templateTasks = [];
    
    switch(templateType) {
        case 'study':
            templateTasks = [
                {
                    title: 'مراجعة الدروس اليومية',
                    category: 'study',
                    priority: 'high',
                    time: '18:00'
                },
                {
                    title: 'حل الواجبات',
                    category: 'study',
                    priority: 'medium',
                    time: '20:00'
                },
                {
                    title: 'تحضير الدروس الغد',
                    category: 'study',
                    priority: 'medium',
                    time: '21:00'
                }
            ];
            break;
        case 'work':
            templateTasks = [
                {
                    title: 'الرد على الإيميلات',
                    category: 'work',
                    priority: 'medium',
                    time: '09:00'
                },
                {
                    title: 'اجتماع الفريق',
                    category: 'work',
                    priority: 'high',
                    time: '11:00'
                },
                {
                    title: 'إنجاز المهام الرئيسية',
                    category: 'work',
                    priority: 'high',
                    time: '14:00'
                }
            ];
            break;
        case 'morning':
            templateTasks = [
                {
                    title: 'التأمل والاسترخاء',
                    category: 'personal',
                    priority: 'low',
                    time: '06:00'
                },
                {
                    title: 'ممارسة الرياضة',
                    category: 'health',
                    priority: 'medium',
                    time: '06:30'
                },
                {
                    title: 'تخطيط اليوم',
                    category: 'personal',
                    priority: 'high',
                    time: '07:00'
                }
            ];
            break;
    }

    // إضافة المهام إلى القائمة
    templateTasks.forEach(async (task) => {
        const today = new Date().toISOString().split('T')[0];
        await addTask({
            ...task,
            date: today,
            description: 'مهمة مضافة من القالب'
        });
    });

    showNotification('تم تحميل القالب بنجاح!', 'success');
}

// 🎯 تهيئة التطبيق
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    
    // إغلاق النماذج عند النقر خارج المحتوى
    document.querySelectorAll('.form-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    // تعيين تاريخ اليوم كقيمة افتراضية
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('taskDate').value = today;
    
    // تعيين تاريخ ميلاد افتراضي (18 سنة)
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
    document.getElementById('profileBirthdate').value = eighteenYearsAgo.toISOString().split('T')[0];

    // تحديد خيار "لا تكرار" افتراضياً
    document.querySelector('.repeat-option[data-value="none"]').classList.add('selected');
});
