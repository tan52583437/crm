// 过滤数字输入
        function filterDigitsOnly(input) {
            input.value = input.value.replace(/[^0-9]/g, '');
        }

        // CRM 应用主控制器
        const CRMApp = {
            // 当前用户
            currentUser: null,
            // 确认回调函数
            confirmCallback: null,
            // 上次编辑账户时的默认值
            lastEditDefaults: {},
            // 排序相关属性
            sortField: null,
            sortOrder: null,
            
            // 系统数据
            customers: [],
            accounts: [],
            groupLeaders: [],
            scenarios: [
                { name: '全部', conditions: [] },
                { name: '新资源', conditions: [{ field: 'customerLevel', operator: '=', value: '新资源' }] },
                { name: 'A类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'A类客户' }] },
                { name: 'B类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'B类客户' }] },
                { name: 'C类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'C类客户' }] },
                { name: '黑名单', conditions: [{ field: 'customerLevel', operator: '=', value: '黑名单' }] }
            ],
            logs: [],
            roles: {
                1: '超级管理员',
                2: '组内管理员',
                3: '组员'
            },
            // 初始化部门自定义下拉框
            initDepartmentDropdown: function(inputId, dropdownId, initialValue) {
    const departmentInput = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    
    if (!departmentInput || !dropdown) return;
    
    // 清空现有选项
    dropdown.innerHTML = '';
    
    // 获取部门列表（从fieldOptions.json中提取部门数据）
    const departments = this.getUniqueDepartments();
    
    // 如果初始值不在部门列表中，则添加它
    if (initialValue && !departments.includes(initialValue)) {
        departments.push(initialValue);
    }
    
    // 添加部门选项
    departments.forEach(dept => {
        const option = document.createElement('div');
        option.className = 'custom-select-option';
        option.dataset.value = dept;
        option.textContent = dept;
        option.onclick = function() {
            departmentInput.value = dept;
            dropdown.classList.remove('show');
        };
        dropdown.appendChild(option);
    });
    
    // 设置初始值
    if (initialValue) {
        departmentInput.value = initialValue;
    }
    
    // 绑定输入框点击事件以显示下拉框
    departmentInput.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
    });
    
    // 绑定输入框获取焦点事件
    departmentInput.addEventListener('focus', (e) => {
        e.stopPropagation();
        dropdown.classList.add('show');
    });
    
    // 点击页面其他地方关闭下拉框
    document.addEventListener('click', (e) => {
        if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${dropdownId}`)) {
            dropdown.classList.remove('show');
        }
    });
    
    // 绑定键盘事件
    departmentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.classList.remove('show');
        } else if (e.key === 'Enter') {
            dropdown.classList.toggle('show');
        }
    });
},            

            // 从账户数据中提取唯一部门
            getUniqueDepartmentsFromAccounts: function() {
    const departments = new Set();
    
    // 从账户数据中提取部门
    this.accounts.forEach(account => {
        if (account.department && account.department.trim()) {
            departments.add(account.department.trim());
        }
    });
    
    // 从客户数据中提取部门（确保已经存在的部门也能显示）
    this.customers.forEach(customer => {
        if (customer.department && customer.department.trim()) {
            departments.add(customer.department.trim());
        }
    });
    
    return Array.from(departments).sort();
},
            // 当前页面和筛选状态
            currentPage: 'dashboard',
            currentFilter: '全部',
            currentPageIndex: 1,
            pageSize: 15,
            searchKeyword: '',
            searchMode: 'fuzzy', // 'fuzzy' 或 'exact'
            
            // 统一时间格式化函数
            formatDateTime: function(date) {
                if (!(date instanceof Date)) {
                    date = new Date(date);
                }
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
            },

            // 初始化
            init: function() {
    console.log('CRMApp 初始化开始');
    this.checkLogin();
    this.loadData();
  