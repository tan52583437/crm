
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
    this.setupEventListeners();
    this.loadPage('dashboard');
    
    // 初始化导入历史记录（如果没有则创建空数组）
    if (!localStorage.getItem('crm_import_history')) {
        localStorage.setItem('crm_import_history', JSON.stringify([]));
    }
    
    // 获取字段选项
    crmApp.loadFieldOptions();
    
    // 渲染组长列表
    setTimeout(() => {
        this.displayGroupLeaders();
    }, 1000);
    
    // 显示欢迎消息
    setTimeout(() => {
        this.showNotification(`欢迎回来，${this.currentUser.name}！`, 'success');
    }, 500);
    
    // 定期检查用户状态（每30秒检查一次）
    setInterval(() => {
        if (this.currentUser) {
            this.checkUserStatus();
        }
    }, 30000);
    
    console.log('CRMApp 初始化完成');
},
            
            // 检查登录状态
            checkLogin: function() {
                console.log('检查登录状态');
                const savedUser = localStorage.getItem('crm_user');
                
                if (!savedUser) {
                    console.log('未找到用户信息，跳转到登录页面');
                    window.location.href = 'login.html';
                    return;
                }
                
                try {
                    this.currentUser = JSON.parse(savedUser);
                    console.log('当前用户:', this.currentUser);
                    // 检查用户状态
                    this.checkUserStatus().catch(e => console.error('检查用户状态失败:', e));
                } catch (e) {
                    console.error('解析用户数据失败:', e);
                    localStorage.removeItem('crm_user');
                    window.location.href = 'login.html';
                }
            },
            // 检查用户状态
            checkUserStatus: async function() {
                    const res = await fetch('http://localhost:3000/api/accounts');
                    const accounts = await res.json();
                    const user = accounts.find(u => u.username === this.currentUser.username);
                    if (user && user.status === 'inactive') {
                        this.showNotification('此账户已禁用，请联系管理员开通。', 'error');
                        localStorage.removeItem('crm_user');
                        setTimeout(() => {
                            window.location.href = 'login.html';
                        }, 2000);
                    } else if (user) {
                        // 更新本地存储的用户信息，确保部门信息同步
                        localStorage.setItem('crm_user', JSON.stringify(user));
                        this.currentUser = user;
                        
                        // 如果用户没有部门信息，则尝试从API获取并设置
                        if (!this.currentUser.department) {
                            try {
                                const response = await fetch(`http://localhost:3000/api/accounts/${this.currentUser.id}`);
                                if (response.ok) {
                                    const result = await response.json();
                                    if (result.ok && result.account) {
                                        this.currentUser.department = result.account.department || '';
                                        localStorage.setItem('crm_user', JSON.stringify(this.currentUser));
                                    }
                                }
                            } catch (e) {
                                console.error('获取用户部门信息失败:', e);
                            }
                        }
                    }
            },
            
            // 加载数据
            loadData: function() {
                console.log('加载数据');
                this.loadCustomers();
                this.loadAccounts();
                this.loadScenarios();
                this.loadLogs();
                this.loadGroupLeaders();
            },
            
            // 加载客户数据
            loadCustomers: function() {
                const savedCustomers = localStorage.getItem('crm_customers');
                if (savedCustomers) {
                    try {
                        this.customers = JSON.parse(savedCustomers);
                        // 确保所有客户数据都有必要的字段
                        this.customers = this.customers.map(customer => {
                            return {
                                id: customer.id || 0,
                                name: customer.name || '',
                                callStatus: customer.callStatus || '',
                                phone: customer.phone || '',
                                customerLevel: customer.customerLevel || '',
                                notes: customer.notes || '',
                                updateTime: customer.updateTime || this.formatDateTime(new Date()),
                                owner: customer.owner || '',
                                department: customer.department || ''
                            };
                        });
                    } catch (e) {
                        console.error('解析客户数据失败:', e);
                        this.customers = this.generateSampleCustomers();
                        this.saveCustomers();
                    }
                } else {
                    // 初始化示例数据
                    this.customers = this.generateSampleCustomers();
                    this.saveCustomers();
                }
                console.log('加载客户数据完成，共', this.customers.length, '个客户');
            },
            // 显示组长管理模态框
showGroupLeaderModal: function() {
    console.log('showGroupLeaderModal函数被调用');
    const modal = document.getElementById('group-leader-modal');
    if (!modal) {
        console.error('组长管理模态框不存在');
        return;
    }
    
    // 清空并重新填充部门自定义下拉列表
    const departmentInput = document.getElementById('group-leader-department');
    const dropdown = document.getElementById('group-leader-department-dropdown');
    if (departmentInput && dropdown) {
        // 清空现有选项
        dropdown.innerHTML = '';
        
        // 从账户数据中获取唯一的部门
        const departments = this.getUniqueDepartments();
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
    }
    
    // 清空并重新填充组长下拉框
    const leaderSelect = document.getElementById('group-leader-name');
    if (leaderSelect) {
        // 清空现有选项
        leaderSelect.innerHTML = '';
        
        // 获取组内管理员（roleId = 2）
        const groupLeaders = this.accounts.filter(account => account.roleId === 2);
        groupLeaders.forEach(leader => {
            const option = document.createElement('option');
            option.value = leader.id;
            option.textContent = leader.name;
            leaderSelect.appendChild(option);
        });
    }
    
    // 清空并重新填充组内员工选择列表
    const membersContainer = document.getElementById('group-members-container');
    if (membersContainer) {
        membersContainer.innerHTML = '';
        
        // 获取组内员工（roleId = 3）
        const groupMembers = this.accounts.filter(account => account.roleId === 3);
        groupMembers.forEach(employee => {
            const memberRow = document.createElement('div');
            memberRow.style.display = 'flex';
            memberRow.style.alignItems = 'center';
            memberRow.style.marginBottom = '8px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'member-' + employee.id;
            checkbox.value = employee.id;
            
            const label = document.createElement('label');
            label.htmlFor = 'member-' + employee.id;
            label.style.marginLeft = '5px';
            label.textContent = employee.name;
            
            memberRow.appendChild(checkbox);
            memberRow.appendChild(label);
            
            membersContainer.appendChild(memberRow);
        });
    }
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 绑定关闭按钮事件
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
        // 使用 onclick 替代 addEventListener 避免多次绑定
        closeBtn.onclick = () => {
            this.closeModal('group-leader-modal');
        };
    }
    
    // 绑定保存按钮事件（先移除现有事件监听）
    const saveBtn = modal.querySelector('.btn-primary');
    if (saveBtn) {
        // 使用 onclick 替代 addEventListener 避免多次绑定
        saveBtn.onclick = () => {
            this.saveGroupLeader();
        };
    }
},

// 显示编辑组长模态框
showEditGroupLeaderModal: function(currentLeader) {
    console.log('showEditGroupLeaderModal函数被调用，编辑组长:', currentLeader);
    if (!currentLeader) {
        console.error('当前编辑的组长不存在');
        return;
    }
    
    // 保存当前编辑的组长索引
    const savedGroupLeaders = localStorage.getItem('crm_group_leaders');
    let groupLeadersData = [];
    if (savedGroupLeaders) {
        try {
            groupLeadersData = JSON.parse(savedGroupLeaders);
        } catch (e) {
            console.error('解析组长数据失败:', e);
        }
    }
    
    // 查找当前编辑的组长索引
    this.currentEditingLeaderIndex = groupLeadersData.findIndex(leader => {
        // 比较方式：优先使用 leaderIds，否则使用 name
        if (leader.leaderIds && currentLeader.leaderIds) {
            return leader.leaderIds.join(',') === currentLeader.leaderIds.join(',');
        } else if (leader.name && currentLeader.name) {
            return leader.name === currentLeader.name;
        }
        return false;
    });
    
    const modal = document.getElementById('edit-group-leader-modal');
    if (!modal) {
        console.error('编辑组长模态框不存在');
        return;
    }
    
    // 清空并重新填充部门自定义下拉列表
    const departmentInput = document.getElementById('edit-group-leader-department');
    const dropdown = document.getElementById('edit-group-leader-department-dropdown');
    if (departmentInput && dropdown) {
        // 清空现有选项
        dropdown.innerHTML = '';
        
        // 从账户数据中获取唯一的部门
        const departments = this.getUniqueDepartments();
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
        
        // 设置部门输入框的默认值
        if (currentLeader.department) {
            departmentInput.value = currentLeader.department;
        } else {
            departmentInput.value = '';
        }
    }
    
    // 清空并重新填充组长下拉框
    const leaderSelect = document.getElementById('edit-group-leader-name');
    if (leaderSelect) {
        // 清空现有选项
        leaderSelect.innerHTML = '';
        
        // 获取组内管理员（roleId = 2）
        const groupLeaders = this.accounts.filter(account => account.roleId === 2);
        groupLeaders.forEach(leader => {
            const option = document.createElement('option');
            option.value = leader.id;
            option.textContent = leader.name;
            // 判断是否选中 - 修复点
            const shouldBeSelected = this.shouldSelectLeader(leader, currentLeader);
            if (shouldBeSelected) {
                option.selected = true;
                console.log('默认选中组长:', leader.name);
            }
            leaderSelect.appendChild(option);
        });
        
        // 启用多选
        leaderSelect.multiple = true;
    }
    
    // 清空并重新填充组内员工选择列表
    const membersContainer = document.getElementById('edit-group-members-container');
    if (membersContainer) {
        membersContainer.innerHTML = '';
        
        // 获取组内员工（roleId = 3）
        const groupMembers = this.accounts.filter(account => account.roleId === 3);
        
        // 获取当前组长管理的员工ID
        let managedMemberIds = [];
        if (currentLeader) {
            // 处理两种数据格式：旧格式的members和新格式的memberIds
            if (currentLeader.members) {
                managedMemberIds = Array.isArray(currentLeader.members) ? 
                    currentLeader.members.map(id => id.toString()) : [];
            } else if (currentLeader.memberIds) {
                managedMemberIds = Array.isArray(currentLeader.memberIds) ? 
                    currentLeader.memberIds.map(id => id.toString()) : [];
            }
        }
        console.log('组长管理的员工ID:', managedMemberIds);
        
        groupMembers.forEach(employee => {
            const memberRow = document.createElement('div');
            memberRow.style.display = 'flex';
            memberRow.style.alignItems = 'center';
            memberRow.style.marginBottom = '8px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'edit-member-' + employee.id;
            checkbox.value = employee.id;
            
            // 默认选中当前组长管理的员工
            const employeeIdStr = employee.id.toString();
            if (managedMemberIds.includes(employeeIdStr)) {
                checkbox.checked = true;
                console.log('选中员工:', employee.name);
            }
            
            const label = document.createElement('label');
            label.htmlFor = 'edit-member-' + employee.id;
            label.style.marginLeft = '5px';
            label.textContent = employee.name;
            
            memberRow.appendChild(checkbox);
            memberRow.appendChild(label);
            
            membersContainer.appendChild(memberRow);
        });
    }
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 绑定关闭按钮事件
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
        // 使用 onclick 替代 addEventListener 避免多次绑定
        closeBtn.onclick = () => {
            this.closeModal('edit-group-leader-modal');
        };
    }
    
    // 绑定保存按钮事件
    const saveBtn = modal.querySelector('.btn-primary');
    if (saveBtn) {
        // 使用 onclick 替代 addEventListener 避免多次绑定
        saveBtn.onclick = () => {
            this.updateGroupLeader();
        };
    }
},

// 新增辅助函数：判断是否应该选中该组长
shouldSelectLeader: function(leader, currentLeader) {
    if (!currentLeader) return false;
    
    // 如果有 leaderIds，使用 leaderIds 进行比较
    if (currentLeader.leaderIds && Array.isArray(currentLeader.leaderIds)) {
        return currentLeader.leaderIds.some(leaderId => 
            leaderId.toString() === leader.id.toString()
        );
    }
    
    // 如果有 name，使用 name 进行比较
    if (currentLeader.name) {
        const leaderNames = currentLeader.name.split(', ');
        return leaderNames.includes(leader.name);
    }
    
    // 如果有 leaderNames，使用 leaderNames 进行比较
    if (currentLeader.leaderNames && Array.isArray(currentLeader.leaderNames)) {
        return currentLeader.leaderNames.includes(leader.name);
    }
    
    return false;
},

// 保存组长设置
saveGroupLeader: function() {
    const leaderSelect = document.getElementById('group-leader-name');
    const departmentSelect = document.getElementById('group-leader-department');
    const membersContainer = document.getElementById('group-members-container');
    
    if (!leaderSelect || !departmentSelect || !membersContainer) {
        this.showNotification('表单元素不存在', 'error');
        return;
    }
    
    const selectedLeaderIds = Array.from(leaderSelect.selectedOptions).map(option => option.value);
    const selectedLeaderNames = Array.from(leaderSelect.selectedOptions).map(option => option.textContent);
    const selectedDepartment = departmentSelect.value;
    
    // 获取选中的组员
    const selectedMemberCheckboxes = membersContainer.querySelectorAll('input[type="checkbox"]:checked');
    const selectedMemberIds = Array.from(selectedMemberCheckboxes).map(cb => cb.value);
    
    if (selectedLeaderIds.length === 0) {
        this.showNotification('请选择至少一个组长', 'warning');
        return;
    }
    
    if (!selectedDepartment) {
        this.showNotification('请选择所属部门', 'warning');
        return;
    }
    
    // 创建新的组长数据（使用一致的数据结构）
    const newGroupLeader = {
        leaderIds: selectedLeaderIds,           // 组长ID数组
        leaderNames: selectedLeaderNames,       // 组长姓名数组
        department: selectedDepartment,         // 部门
        memberIds: selectedMemberIds,           // 组员ID数组
        name: selectedLeaderNames.join(', ')    // 兼容旧格式
    };
    
    // 同步更新员工部门
    selectedMemberIds.forEach(memberId => {
        const member = this.accounts.find(a => a.id == memberId);
        if (member) {
            member.department = selectedDepartment;
        }
    });
    // 同步更新组长自身部门
    selectedLeaderIds.forEach(leaderId => {
        const leader = this.accounts.find(a => a.id == leaderId);
        if (leader) {
            leader.department = selectedDepartment;
        }
    });
    this.saveAccounts();
    
    // 保存到本地存储
    this.groupLeaders.push(newGroupLeader);
    localStorage.setItem('crm_group_leaders', JSON.stringify(this.groupLeaders));
    
    // 显示成功消息
    this.showNotification(`已设置 ${newGroupLeader.leaderNames.join('、')} 为${newGroupLeader.department}的组长`, 'success');
    
    // 关闭模态框
    this.closeModal('group-leader-modal');
    
    // 更新组长列表显示
    this.displayGroupLeaders();
        // 同步更新账户管理页面的部门标签
    this.displayAccounts();
    // 同步更新账户管理页面的部门标签
    this.displayAccounts();
    // 同步更新账户管理页面的部门标签
    this.displayAccounts();
},



// 更新组长设置
    updateGroupLeader: function() {
    const leaderSelect = document.getElementById('edit-group-leader-name');
    const departmentSelect = document.getElementById('edit-group-leader-department');
    const membersContainer = document.getElementById('edit-group-members-container');
    
    if (!leaderSelect || !departmentSelect || !membersContainer) {
        this.showNotification('表单元素不存在', 'error');
        return;
    }
    
    const selectedLeaderIds = Array.from(leaderSelect.selectedOptions).map(option => option.value);
    const selectedLeaderNames = Array.from(leaderSelect.selectedOptions).map(option => option.textContent);
    const selectedDepartment = departmentSelect.value;
    
    // 获取选中的组员
    const selectedMemberCheckboxes = membersContainer.querySelectorAll('input[type="checkbox"]:checked');
    const selectedMemberIds = Array.from(selectedMemberCheckboxes).map(cb => cb.value);
    
    if (selectedLeaderIds.length === 0) {
        this.showNotification('请选择至少一个组长', 'warning');
        return;
    }
    
    if (!selectedDepartment) {
        this.showNotification('请选择所属部门', 'warning');
        return;
    }
    
    // 从本地存储获取组长数据
    const savedGroupLeaders = localStorage.getItem('crm_group_leaders');
    let groupLeadersData = [];
    if (savedGroupLeaders) {
        try {
            groupLeadersData = JSON.parse(savedGroupLeaders);
        } catch (e) {
            console.error('解析组长数据失败:', e);
        }
    }
    
    // 创建更新后的组长数据
    const updatedGroupLeader = {
        leaderIds: selectedLeaderIds,
        leaderNames: selectedLeaderNames,
        department: selectedDepartment,
        memberIds: selectedMemberIds,
        name: selectedLeaderNames.join(', ')    // 兼容旧格式
    };
    
    // 使用保存的索引来更新组长数据
    if (this.currentEditingLeaderIndex !== -1 && this.currentEditingLeaderIndex < groupLeadersData.length) {
        groupLeadersData[this.currentEditingLeaderIndex] = updatedGroupLeader;
    } else {
        // 如果找不到，添加新的
        groupLeadersData.push(updatedGroupLeader);
    }
    
    // 同步更新员工部门
    selectedMemberIds.forEach(memberId => {
        const member = this.accounts.find(a => a.id == memberId);
        if (member) {
            member.department = selectedDepartment;
        }
    });
    // 同步更新组长自身部门
    selectedLeaderIds.forEach(leaderId => {
        const leader = this.accounts.find(a => a.id == leaderId);
        if (leader) {
            leader.department = selectedDepartment;
        }
    });
    this.saveAccounts();
    
    // 保存到本地存储
    localStorage.setItem('crm_group_leaders', JSON.stringify(groupLeadersData));
    
    // 显示成功消息
    this.showNotification(`已更新 ${updatedGroupLeader.leaderNames.join('、')} 为${updatedGroupLeader.department}的组长`, 'success');
    
    // 关闭模态框
    this.closeModal('edit-group-leader-modal');
    
    // 更新组长列表显示
    this.displayGroupLeaders();
    this.displayAccounts();
},

    // 显示组长列表
displayGroupLeaders: function() {
    const tbody = document.getElementById('group-leaders-body');
    if (!tbody) return;
    
    // 清空现有内容
    tbody.innerHTML = '';
    
    // 从本地存储获取组长数据
    const savedGroupLeaders = localStorage.getItem('crm_group_leaders');
    let groupLeadersData = [];
    if (savedGroupLeaders) {
        try {
            groupLeadersData = JSON.parse(savedGroupLeaders);
            // 确保数据是数组
            if (!Array.isArray(groupLeadersData)) {
                groupLeadersData = [];
            }
        } catch (e) {
            console.error('解析组长数据失败:', e);
            groupLeadersData = [];
        }
    }
    
    // 显示组长列表
    groupLeadersData.forEach((leader, index) => {
        // 获取组长姓名
        let leaderNames = [];
        if (leader.leaderIds && Array.isArray(leader.leaderIds)) {
            // 通过 leaderIds 查找组长姓名
            leader.leaderIds.forEach(leaderId => {
                const account = this.accounts.find(acc => 
                    acc.id.toString() === leaderId.toString()
                );
                if (account) {
                    leaderNames.push(account.name);
                }
            });
        } else if (leader.name) {
            // 使用旧格式的 name 字段
            leaderNames = [leader.name];
        } else if (leader.leaderNames && Array.isArray(leader.leaderNames)) {
            // 使用 leaderNames 字段
            leaderNames = leader.leaderNames;
        }
        
        // 获取员工数量
        let memberCount = 0;
        if (leader.members && Array.isArray(leader.members)) {
            memberCount = leader.members.length;
        } else if (leader.memberIds && Array.isArray(leader.memberIds)) {
            memberCount = leader.memberIds.length;
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${leaderNames.join(', ') || '未知组长'}</td>
            <td>${leader.department || '未分配部门'}</td>
            <td>${memberCount} 人</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="CRMApp.editGroupLeader(${index})">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="CRMApp.deleteGroupLeader(${index})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
},

// 编辑组长
editGroupLeader: function(leaderIndex) {
    // 这里添加编辑组长的逻辑
    console.log('编辑组长索引:', leaderIndex);
    // 从本地存储获取组长数据
    const savedGroupLeaders = localStorage.getItem('crm_group_leaders');
    let groupLeadersData = [];
    if (savedGroupLeaders) {
        try {
            groupLeadersData = JSON.parse(savedGroupLeaders);
        } catch (e) {
            console.error('解析组长数据失败:', e);
        }
    }
    // 获取当前编辑的组长
    const currentLeader = groupLeadersData[leaderIndex];
    if (!currentLeader) {
        console.error('当前编辑的组长不存在');
        return;
    }
    // 打开编辑组长模态框并填充现有数据
    this.showEditGroupLeaderModal(currentLeader);
},

// 删除组长
deleteGroupLeader: function(leaderIndex) {
    // 这里添加删除组长的逻辑
    console.log('删除组长索引:', leaderIndex);
    const self = this;
    // 从本地存储获取组长数据
    const savedGroupLeaders = localStorage.getItem('crm_group_leaders');
    let groupLeadersData = [];
    if (savedGroupLeaders) {
        try {
            groupLeadersData = JSON.parse(savedGroupLeaders);
        } catch (e) {
            console.error('解析组长数据失败:', e);
        }
    }
    // 获取要删除的组长
    const leaderToDelete = groupLeadersData[leaderIndex];
    CRMApp.showConfirmModal('删除组长', `确定要删除组长吗？`, () => {
        // 从数组中删除组长
        groupLeadersData.splice(leaderIndex, 1);
        
        // 更新本地存储
        localStorage.setItem('crm_group_leaders', JSON.stringify(groupLeadersData));
        
        // 显示成功消息
        self.showNotification('组长已删除', 'success');
        // 更新组长列表显示
        self.displayGroupLeaders();
    });
},
            // 生成示例客户数据
            generateSampleCustomers: function() {
                const customers = [];
                const names = ['张伟', '王芳', '李娜', '刘洋', '陈静', '杨帆', '赵勇', '黄蓉', '周杰', '吴昊'];
                const departments = ['销售一部', '销售二部', '客服部', '市场部'];
                const callStatuses = ['已接通', '未接听', '空号', '关机', '拒接'];
                const levels = ['A类客户', 'B类客户', 'C类客户', '黑名单'];
                const owners = ['张经理', '李销售', '王客服', '刘销售'];
                
                for (let i = 1; i <= 50; i++) {
                    const name = names[Math.floor(Math.random() * names.length)] + i;
                    const phone = '1' + Math.floor(Math.random() * 9000000000 + 1000000000).toString();
                    const callStatus = callStatuses[Math.floor(Math.random() * callStatuses.length)];
                    const customerLevel = levels[Math.floor(Math.random() * levels.length)];
                    const owner = owners[Math.floor(Math.random() * owners.length)];
                    const department = departments[Math.floor(Math.random() * departments.length)];
                    
                    const date = new Date();
                    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
                    const updateTime = this.formatDateTime(date);
                    
                    customers.push({
                        id: i,
                        name,
                        callStatus,
                        phone,
                        customerLevel,
                        notes: `这是客户 ${name} 的备注信息，可能需要跟进${i % 3 === 0 ? '，意向较高' : ''}`,
                        updateTime,
                        owner,
                        department
                    });
                }
                
                return customers;
            },
            
            // 加载账户数据
            loadAccounts: async function() {
                // 优先使用本地数据
                const savedAccounts = localStorage.getItem('crm_accounts');
                if (savedAccounts) {
                    try {
                        this.accounts = JSON.parse(savedAccounts);
                        console.log('从本地存储加载账户数据完成，共', this.accounts.length, '个账户');
                        return;
                    } catch (parseError) {
                        console.error('解析本地账户数据失败:', parseError);
                    }
                }
                
                // 如果本地数据不存在或解析失败，再从API加载
                try {
                    const response = await fetch('http://localhost:3000/api/accounts');
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        this.accounts = data;
                        console.log('从API加载账户数据完成，共', this.accounts.length, '个账户');
                    } else {
                        throw new Error('账户数据格式错误');
                    }
                } catch (e) {
                    console.error('加载账户数据失败:', e);
                    this.accounts = this.generateSampleAccounts();
                    console.log('使用示例账户数据，共', this.accounts.length, '个账户');
                }
            },
            
            // 生成示例账户数据
            generateSampleAccounts: function() {
                return [
                    { 
                        id: 1, 
                        username: '100001', 
                        name: '张经理', 
                        password: '123456', 
                        position: '销售经理', 
                        roleId: 1, 
                        department: '销售一部', 
                        status: 'active', 
                        email: 'admin@crm.com', 
                        phone: '13800138000', 
                        createdAt: new Date().toISOString(), 
                        lastLogin: new Date().toISOString()
                    },
                    { 
                        id: 2, 
                        username: '100002', 
                        name: '李销售', 
                        password: '123456', 
                        position: '销售专员', 
                        roleId: 3, 
                        department: '销售二部', 
                        status: 'active', 
                        email: 'staff1@crm.com', 
                        phone: '13900139001', 
                        createdAt: new Date().toISOString(), 
                        lastLogin: new Date().toISOString()
                    },
                    { 
                        id: 3, 
                        username: '100003', 
                        name: '王客服', 
                        password: '123456', 
                        position: '客服专员', 
                        roleId: 3, 
                        department: '客服部', 
                        status: 'active', 
                        email: 'staff2@crm.com', 
                        phone: '13700137002', 
                        createdAt: new Date().toISOString(), 
                        lastLogin: new Date().toISOString()
                    },
                    { 
                        id: 4, 
                        username: '100004', 
                        name: '刘主管', 
                        password: '123456', 
                        position: '销售主管', 
                        roleId: 2, 
                        department: '销售一部', 
                        status: 'active', 
                        email: 'groupadmin@crm.com', 
                        phone: '13600136003', 
                        createdAt: new Date().toISOString(), 
                        lastLogin: new Date().toISOString()
                    },
                ];
            },
            
            // 加载场景数据
            loadScenarios: function() {
                const savedScenarios = localStorage.getItem('crm_scenarios');
                if (savedScenarios) {
                    try {
                        const parsed = JSON.parse(savedScenarios);
                        // 确保场景是对象数组
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            this.scenarios = parsed.map(item => {
                                if (typeof item === 'object' && item.name) {
                                    return {
                                        name: item.name,
                                        conditions: item.conditions || []
                                    };
                                } else if (typeof item === 'string') {
                                    // 兼容旧数据格式
                                    return {
                                        name: item,
                                        conditions: []
                                    };
                                }
                                return { name: String(item), conditions: [] };
                            });
                            

                            
                            // 确保包含"全部"项
                            if (!this.scenarios.some(s => s.name === '全部')) {
                                this.scenarios.unshift({ name: '全部', conditions: [] });
                            }
                        } else {
                            throw new Error('场景数据格式错误');
                        }
                    } catch (e) {
                        console.error('解析场景数据失败:', e);
                        this.scenarios = [
                            { name: '全部', conditions: [] },
                            { name: '新资源', conditions: [{ field: 'customerLevel', operator: '=', value: '新资源' }] },
                            { name: 'A类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'A类客户' }] },
                            { name: 'B类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'B类客户' }] },
                            { name: 'C类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'C类客户' }] },
                            { name: '黑名单', conditions: [{ field: 'customerLevel', operator: '=', value: '黑名单' }] }
                        ];
                        this.saveScenarios();
                    }
                } else {
                    // 如果localStorage中没有场景数据，使用默认值
                    this.scenarios = [
                        { name: '全部', conditions: [] },
                        { name: '新资源', conditions: [{ field: 'customerLevel', operator: '=', value: '新资源' }] },
                        { name: 'A类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'A类客户' }] },
                        { name: 'B类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'B类客户' }] },
                        { name: 'C类客户', conditions: [{ field: 'customerLevel', operator: '=', value: 'C类客户' }] },
                        { name: '黑名单', conditions: [{ field: 'customerLevel', operator: '=', value: '黑名单' }] }
                    ];
                    this.saveScenarios();
                }
                
                // 确保所有场景都有visibility属性
                this.scenarios.forEach(scenario => {
                    if (scenario.name === '全部') {
                        scenario.visibility = 'always';
                    } else if (scenario.visibility === undefined) {
                        scenario.visibility = 'visible';
                    }
                });
                
                console.log('加载场景数据完成，共', this.scenarios.length, '个场景');
            },
            
            // 加载组长数据
            loadGroupLeaders: function() {
                const savedGroupLeaders = localStorage.getItem('crm_group_leaders');
                if (savedGroupLeaders) {
                    try {
                        this.groupLeaders = JSON.parse(savedGroupLeaders);
                    } catch (e) {
                        console.error('解析组长数据失败:', e);
                        this.groupLeaders = [];
                    }
                } else {
                    this.groupLeaders = [];
                }
                console.log('加载组长数据完成，共', this.groupLeaders.length, '个组长');
            },
            
            // 渲染组长列表
            renderGroupLeaders: function() {
                const tbody = document.getElementById('group-leaders-body');
                if (!tbody) return;
                
                // 清空现有内容
                tbody.innerHTML = '';
                
                // 渲染每个组长
                this.groupLeaders.forEach((group, index) => {
                    const leaderNames = [];
                    const memberNames = [];
                    
                    // 获取组长姓名
                    group.leaderIds.forEach(leaderId => {
                        const leader = this.accounts.find(acc => String(acc.id) === String(leaderId));
                        if (leader) {
                            leaderNames.push(leader.name);
                        }
                    });
                    
                    // 获取组员姓名
                    group.memberIds.forEach(memberId => {
                        const member = this.accounts.find(acc => String(acc.id) === String(memberId));
                        if (member) {
                            memberNames.push(member.name);
                        }
                    });
                    
                    // 创建表格行
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${leaderNames.join(', ')}</td>
                        <td>${group.department}</td>
                        <td>${memberNames.join(', ')}</td>
                        <td>
                            <button class="btn btn-sm btn-danger" onclick="crmApp.deleteGroupLeader(${index})">删除</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            },
            
            // 删除组长
            deleteGroupLeader: function(index) {
                this.groupLeaders.splice(index, 1);
                localStorage.setItem('crm_group_leaders', JSON.stringify(this.groupLeaders));
                this.displayGroupLeaders();
            },

            // 加载日志数据
            loadLogs: function() {
                const savedLogs = localStorage.getItem('crm_logs');
                if (savedLogs) {
                    try {
                        this.logs = JSON.parse(savedLogs);
                    } catch (e) {
                        console.error('解析日志数据失败:', e);
                        this.logs = [];
                    }
                } else {
                    this.logs = [];
                }
                console.log('加载日志数据完成，共', this.logs.length, '条日志');
            },
            
            // 保存客户数据
            saveCustomers: function() {
                localStorage.setItem('crm_customers', JSON.stringify(this.customers));
            },
            
            // 保存账户数据
            saveAccounts: async function() {
                localStorage.setItem('crm_accounts', JSON.stringify(this.accounts));
            },
            
            // 创建账户（通过API）
            createAccount: async function(accountData) {
                try {
                    const response = await fetch('http://localhost:3000/api/accounts', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(accountData)
                    });
                    const result = await response.json();
                    if (result.ok) {
                        this.accounts.push(result.account);
                        this.saveAccounts();
                        this.displayAccounts();
                        return result;
                    } else {
                        throw new Error(result.message || '创建账户失败');
                    }
                } catch (e) {
                    console.error('创建账户失败:', e);
                    throw e;
                }
            },
            
            // 更新账户（通过API）
            updateAccount: async function(accountId, accountData) {
                try {
                    // 获取当前登录用户
                    const currentUser = JSON.parse(localStorage.getItem('crm_user')) || {};
                    const currentUsername = currentUser.username || '';
                    
                    // 添加当前用户名到请求数据
                    const dataWithCurrentUser = {
                        ...accountData,
                        currentUsername
                    };
                    
                    const response = await fetch(`/api/accounts/${accountId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(dataWithCurrentUser)
                    });
                    const result = await response.json();
                    if (result.ok) {
                        const index = this.accounts.findIndex(a => a.id === accountId);
                        if (index !== -1) {
                            this.accounts[index] = result.account;
                            this.saveAccounts();
                            this.displayAccounts();
                        }
                        return result;
                    } else {
                        throw new Error(result.message || '更新账户失败');
                    }
                } catch (e) {
                    console.error('更新账户失败:', e);
                    throw e;
                }
            },
            
            // 删除账户（通过API）
            deleteAccountAPI: async function(accountId) {
                try {
                    // 获取当前登录用户
                    const currentUser = JSON.parse(localStorage.getItem('crm_user')) || {};
                    const currentUsername = currentUser.username || '';
                    
                    const response = await fetch(`/api/accounts/${accountId}`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ currentUsername })
                    });
                    const result = await response.json();
                    if (result.ok) {
                        const index = this.accounts.findIndex(a => a.id === accountId);
                        if (index !== -1) {
                            this.accounts.splice(index, 1);
                            this.saveAccounts();
                            this.displayAccounts();
                        }
                        return result;
                    } else {
                        throw new Error(result.message || '删除账户失败');
                    }
                } catch (e) {
                    console.error('删除账户失败:', e);
                    throw e;
                }
            },
            
            // 保存场景数据
            saveScenarios: function() {
                // 保存场景对象数组
                localStorage.setItem('crm_scenarios', JSON.stringify(this.scenarios));
            },
            
            // 保存日志数据
            saveLogs: function() {
                localStorage.setItem('crm_logs', JSON.stringify(this.logs));
            },
            
            // 添加日志
            addLog: function(action, details) {
                const log = {
                    id: this.logs.length + 1,
                    timestamp: new Date().toISOString(),
                    userId: this.currentUser.id,
                    userName: this.currentUser.name,
                    userRole: this.currentUser.roleId,
                    action,
                    details
                };
                
                this.logs.push(log);
                this.saveLogs();
                console.log('添加操作日志:', log);
            },
            
            // 设置事件监听器
            setupEventListeners: function() {
                // 用户信息点击事件
                document.addEventListener('click', (e) => {
                    if (e.target.closest('#user-info')) {
                        console.log('点击用户信息');
                        this.loadPage('profile');
                    }
                });
                
                // 关闭模态框事件
                document.addEventListener('click', (e) => {
                    if (e.target.id === 'close-edit-customer-modal' || e.target.id === 'close-scenario-modal') {
                        this.closeModal(e.target.closest('.modal').id);
                    }
                    
                    if (e.target.classList.contains('close-modal')) {
                        this.closeModal(e.target.closest('.modal').id);
                    }
                });
                
                // 点击模态框外部关闭
                document.addEventListener('click', (e) => {
                    if ((e.target.classList.contains('modal') || e.target.classList.contains('custom-modal'))) {
                        this.closeModal(e.target.id);
                    }
                });
                
                // 确认弹窗按钮
                document.getElementById('confirm-cancel-btn')?.addEventListener('click', () => {
                    this.closeModal('custom-confirm-modal');
                });
                
                document.getElementById('alert-ok-btn')?.addEventListener('click', () => {
                    this.closeModal('custom-alert-modal');
                });
                
                // 确认弹窗确定按钮
                document.getElementById('confirm-ok-btn')?.addEventListener('click', () => {
                    // 如果有确认回调函数，则执行
                    if (this.confirmCallback) {
                        this.confirmCallback();
                        this.confirmCallback = null;
                    }
                    this.closeModal('custom-confirm-modal');
                });
                
                // 编辑账户模态框事件
document.getElementById('close-edit-account-modal')?.addEventListener('click', () => {
    this.closeModal('edit-account-modal');
});

document.getElementById('cancel-edit-account-btn')?.addEventListener('click', () => {
    this.closeModal('edit-account-modal');
});

document.getElementById('save-edit-account-btn')?.addEventListener('click', () => {
    this.saveEditAccount();
});
                
            },
            
            // 加载页面
            loadPage: function(page) {
                console.log('加载页面:', page);
                this.currentPage = page;
                this.currentPageIndex = 1; // 重置到第一页
                
                // 更新侧边栏活动状态
                this.updateSidebar();
                
                // 更新页面标题
                const pageTitles = {
                    'dashboard': '仪表盘',
                    'customer-management': '客户管理',
                    'data-distribution': '数据分发',
                    'account-management': '账户管理',
                    'system-settings': '系统设置',
                    'profile': '个人资料'
                };
                
                const pageDescriptions = {
                    'dashboard': '系统概览与关键指标',
                    'customer-management': '客户信息的增删改查与管理',
                    'data-distribution': '客户数据分发与转移',
                    'account-management': '用户账户与权限管理',
                    'system-settings': '系统配置与参数设置',
                    'profile': '查看和修改个人资料'
                };
                
                document.getElementById('page-title').textContent = pageTitles[page] || '客户关系管理系统';
                document.getElementById('page-description').textContent = pageDescriptions[page] || '请选择左侧菜单';
                
                // 加载页面内容
                this.loadPageContent(page);
            },
            
            // 更新侧边栏
            updateSidebar: function() {
                const sidebar = document.getElementById('sidebar');
                const roleId = this.currentUser.roleId;
                
                // 根据角色动态生成菜单
                let sidebarHTML = `
                    <div class="sidebar-header">
                        <h2><i class="fas fa-user-friends"></i> CRM系统</h2>
                        <p>${this.roles[roleId] || '组员'}</p>
                    </div>
                    
                    <ul class="sidebar-menu">
                        <li><a href="#" class="${this.currentPage === 'dashboard' ? 'active' : ''}" data-target="dashboard"><i class="fas fa-tachometer-alt"></i> <span>仪表盘</span></a></li>
                        <li><a href="#" class="${this.currentPage === 'customer-management' ? 'active' : ''}" data-target="customer-management"><i class="fas fa-users"></i> <span>客户管理</span></a></li>
                `;
                
                // 超级管理员和组内管理员可以看到数据分发
                if (roleId === 1 || roleId === 2) {
                    sidebarHTML += `
                        <li><a href="#" class="${this.currentPage === 'data-distribution' ? 'active' : ''}" data-target="data-distribution"><i class="fas fa-share-alt"></i> <span>数据分发</span></a></li>
                    `;
                }
                
                // 只有超级管理员可以看到账户管理和系统设置
                if (roleId === 1) {
                    sidebarHTML += `
                        <li><a href="#" class="${this.currentPage === 'account-management' ? 'active' : ''}" data-target="account-management"><i class="fas fa-user-cog"></i> <span>账户管理</span></a></li>
                        <li><a href="#" class="${this.currentPage === 'system-settings' ? 'active' : ''}" data-target="system-settings"><i class="fas fa-cogs"></i> <span>系统设置</span></a></li>
                    `;
                }
                
                sidebarHTML += `
                    </ul>
                    
                    <div class="sidebar-footer">
                        <button class="btn-logout" id="logout-btn">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>退出登录</span>
                        </button>
                    </div>
                `;
                
                sidebar.innerHTML = sidebarHTML;
                
                // 更新用户信息显示
                this.updateUserInfo();
                
                // 绑定侧边栏菜单点击事件
                sidebar.querySelectorAll('.sidebar-menu a').forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const target = link.getAttribute('data-target');
                        this.loadPage(target);
                    });
                });
                
                // 绑定退出登录按钮事件
                document.getElementById('logout-btn').addEventListener('click', () => {
                    this.logout();
                });
            },
            
            // 更新用户信息显示
            updateUserInfo: function() {
                const userInfo = document.getElementById('user-info');
                const firstChar = this.currentUser.name ? this.currentUser.name.charAt(0) : 'U';
                const roleName = this.roles[this.currentUser.roleId] || '组员';
                const roleColor = this.currentUser.roleId === 1 ? '#ff9e00' : '#4895ef';
                
                userInfo.innerHTML = `
                    <div class="avatar-circle" style="background-color: ${this.currentUser.avatarColor || '#4361ee'}">
                        ${firstChar}
                    </div>
                    <div class="user-details">
                        <div class="user-name">
                            ${this.currentUser.name || this.currentUser.username}
                            <span class="admin-badge" style="background-color: ${roleColor};">${roleName}</span>
                        </div>
                        <div class="user-position">${this.currentUser.username || '账户'}</div>
                        ${this.currentUser.department ? `<div class="user-department">${this.currentUser.department}</div>` : ''}
                    </div>
                    <i class="fas fa-chevron-down"></i>
                `;
            },
            
            // 加载页面内容
            loadPageContent: function(page) {
                const contentArea = document.getElementById('content-area');
                
                let pageHTML = '';
                
                switch(page) {
                    case 'dashboard':
                        pageHTML = this.getDashboardHTML();
                        break;
                    case 'customer-management':
                        pageHTML = this.getCustomerManagementHTML();
                        break;
                    case 'data-distribution':
                        pageHTML = this.getDataDistributionHTML();
                        break;
                    case 'account-management':
                        pageHTML = this.getAccountManagementHTML();
                        break;
                    case 'system-settings':
                        pageHTML = this.getSystemSettingsHTML();
                        break;
                    case 'profile':
                        pageHTML = this.getProfileHTML();
                        break;
                    default:
                        pageHTML = '<div class="card"><h3>页面开发中</h3><p>此功能正在开发中，敬请期待。</p></div>';
                }
                
                contentArea.innerHTML = pageHTML;
                
                // 初始化页面
                this.initPage(page);
            },
            
            // 获取仪表盘HTML
            getDashboardHTML: function() {
                const roleId = this.currentUser.roleId;
                const isGroupAdmin = roleId === 2;
                const isMember = roleId === 3;
                
                // 获取当前用户的客户数据
                let userCustomers = this.getVisibleCustomers();
                
                // 计算今日数据
                const today = new Date().toISOString().split('T')[0];
                const todayCustomers = userCustomers.filter(c => c.updateTime && c.updateTime.startsWith(today));
                
                // 计算统计数据
                const total = userCustomers.length;
                const newResources = userCustomers.filter(c => c.customerLevel === '新资源').length;
                const connected = userCustomers.filter(c => c.callStatus === '已接通').length;
                const blacklist = userCustomers.filter(c => c.customerLevel === '黑名单').length;
                
                // 如果是组员，显示个人数据
                if (isMember) {
                    const todayCalls = Math.floor(total * 0.7); // 模拟今日外呼总量
                    const todayConnected = Math.floor(todayCalls * 0.3); // 模拟今日接通数量
                    const connectionRate = todayCalls > 0 ? Math.round(todayConnected / todayCalls * 100) : 0;
                    
                    return `
                        <div id="dashboard" class="page-content">
                            <div class="stats-container">
                                <div class="stat-card">
                                    <div class="stat-icon" style="background-color: #4361ee;">
                                        <i class="fas fa-user-plus"></i>
                                    </div>
                                    <div class="stat-info">
                                        <h3 id="total-customers">${todayCustomers.length}</h3>
                                        <p>今日下发数据量</p>
                                    </div>
                                </div>
                                
                                <div class="stat-card">
                                    <div class="stat-icon" style="background-color: #4cc9f0;">
                                        <i class="fas fa-phone-alt"></i>
                                    </div>
                                    <div class="stat-info">
                                        <h3 id="new-customers-month">${todayCalls}</h3>
                                        <p>今日外呼总量</p>
                                    </div>
                                </div>
                                
                                <div class="stat-card">
                                    <div class="stat-icon" style="background-color: #f72585;">
                                        <i class="fas fa-phone-volume"></i>
                                    </div>
                                    <div class="stat-info">
                                        <h3 id="updated-today">${todayConnected}</h3>
                                        <p>今日接通数量</p>
                                    </div>
                                </div>
                                
                                <div class="stat-card">
                                    <div class="stat-icon" style="background-color: #ff9e00;">
                                        <i class="fas fa-percentage"></i>
                                    </div>
                                    <div class="stat-info">
                                        <h3 id="active-users">${connectionRate}%</h3>
                                        <p>接通率</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="card">
                                <div class="card-header">
                                    <h3>我的最近客户</h3>
                                    <button class="btn btn-primary" id="view-all-customers">查看全部</button>
                                </div>
                                <div class="table-container">
                                    <table id="recent-customers-table">
                                        <thead>
                                            <tr>
                                                <th>客户名称</th>
                                                <th>接通状态</th>
                                                <th>手机</th>
                                                <th>客户级别</th>
                                                <th>更新时间</th>
                                            </tr>
                                        </thead>
                                        <tbody id="recent-customers-body">
                                            <!-- 动态填充 -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `;
                }
                
                // 如果是组内管理员，显示团队数据
                if (isGroupAdmin) {
                    // 获取组内成员
                    const groupMembers = this.accounts.filter(a => a.department === this.currentUser.department && a.roleId === 3);
                    
                    let groupStatsHTML = '';
                    groupMembers.forEach(member => {
                        const memberCustomers = this.customers.filter(c => c.owner === member.name && c.department === this.currentUser.department);
                        const memberConnected = memberCustomers.filter(c => c.callStatus === '已接通').length;
                        const memberTotal = memberCustomers.length;
                        const todayMemberCalls = Math.floor(memberTotal * 0.7);
                        const todayMemberConnected = Math.floor(todayMemberCalls * 0.3);
                        const callRate = todayMemberCalls > 0 ? Math.round(todayMemberConnected / todayMemberCalls * 100) : 0;
                        
                        groupStatsHTML += `
                            <tr>
                                <td>${member.name}</td>
                                <td>${memberCustomers.length}</td>
                                <td>${todayMemberCalls}</td>
                                <td>${todayMemberConnected}</td>
                                <td>${callRate}%</td>
                            </tr>
                        `;
                    });
                    
                    // 计算本组统计数据
                    const groupTotal = userCustomers.length;
                    const groupTodayCalls = Math.floor(groupTotal * 0.7);
                    const groupTodayConnected = Math.floor(groupTodayCalls * 0.3);
                    const groupConnectionRate = groupTodayCalls > 0 ? Math.round(groupTodayConnected / groupTodayCalls * 100) : 0;
                    
                    return `
                        <div id="dashboard" class="page-content">
                            <div class="stats-container">
                                <div class="stat-card">
                                    <div class="stat-icon" style="background-color: #4361ee;">
                                        <i class="fas fa-users"></i>
                                    </div>
                                    <div class="stat-info">
                                        <h3 id="total-customers">${groupTotal}</h3>
                                        <p>本组今日下发总量</p>
                                    </div>
                                </div>
                                
                                <div class="stat-card">
                                    <div class="stat-icon" style="background-color: #4cc9f0;">
                                        <i class="fas fa-phone-alt"></i>
                                    </div>
                                    <div class="stat-info">
                                        <h3 id="new-customers-month">${groupTodayCalls}</h3>
                                        <p>本组今日外呼总量</p>
                                    </div>
                                </div>
                                
                                <div class="stat-card">
                                    <div class="stat-icon" style="background-color: #f72585;">
                                        <i class="fas fa-phone-volume"></i>
                                    </div>
                                    <div class="stat-info">
                                        <h3 id="updated-today">${groupTodayConnected}</h3>
                                        <p>本组今日接通总量</p>
                                    </div>
                                </div>
                                
                                <div class="stat-card">
                                    <div class="stat-icon" style="background-color: #ff9e00;">
                                        <i class="fas fa-percentage"></i>
                                    </div>
                                    <div class="stat-info">
                                        <h3 id="active-users">${groupConnectionRate}%</h3>
                                        <p>本组接通率</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="card">
                                <div class="card-header">
                                    <h3>组内成员数据</h3>
                                    <button class="btn btn-primary" id="view-group-details">查看详情</button>
                                </div>
                                <div class="table-container">
                                    <table id="group-stats-table">
                                        <thead>
                                            <tr>
                                                <th>成员姓名</th>
                                                <th>下发数据量</th>
                                                <th>外呼总量</th>
                                                <th>接通数量</th>
                                                <th>接通率</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${groupStatsHTML || '<tr><td colspan="5" style="text-align: center; padding: 20px;">暂无组员数据</td></tr>'}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `;
                }
                
                // 超级管理员视图
                return `
                    <div id="dashboard" class="page-content">
                        <div class="stats-container">
                            <div class="stat-card">
                                <div class="stat-icon" style="background-color: #4361ee;">
                                    <i class="fas fa-users"></i>
                                </div>
                                <div class="stat-info">
                                    <h3 id="total-customers">${total}</h3>
                                    <p>总客户数</p>
                                </div>
                            </div>
                            
                            <div class="stat-card">
                                <div class="stat-icon" style="background-color: #4cc9f0;">
                                    <i class="fas fa-user-plus"></i>
                                </div>
                                <div class="stat-info">
                                    <h3 id="new-customers-month">${newResources}</h3>
                                    <p>新资源客户</p>
                                </div>
                            </div>
                            
                            <div class="stat-card">
                                <div class="stat-icon" style="background-color: #f72585;">
                                    <i class="fas fa-sync-alt"></i>
                                </div>
                                <div class="stat-info">
                                    <h3 id="updated-today">${todayCustomers.length}</h3>
                                    <p>今日更新</p>
                                </div>
                            </div>
                            
                            <div class="stat-card">
                                <div class="stat-icon" style="background-color: #ff9e00;">
                                    <i class="fas fa-user-check"></i>
                                </div>
                                <div class="stat-info">
                                    <h3 id="active-users">${this.accounts.filter(a => a.status === 'active').length}</h3>
                                    <p>当前用户</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="card-header">
                                <h3>最近更新客户</h3>
                                <button class="btn btn-primary" id="view-all-customers">查看全部</button>
                            </div>
                            <div class="table-container">
                                <table id="recent-customers-table">
                                    <thead>
                                        <tr>
                                            <th>客户名称</th>
                                            <th>接通状态</th>
                                            <th>手机</th>
                                            <th>客户级别</th>
                                            <th>更新时间</th>
                                            <th>负责人</th>
                                        </tr>
                                    </thead>
                                    <tbody id="recent-customers-body">
                                        <!-- 动态填充 -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
            },
            
            // 获取客户管理HTML
            getCustomerManagementHTML: function() {
                // 获取当前用户能看到的客户
                const visibleCustomers = this.getVisibleCustomers();
                
                // 计算总页数
                const filteredCustomers = this.getFilteredCustomers();
                const totalPages = Math.ceil(filteredCustomers.length / this.pageSize);
                
                return `
                    <div id="customer-management" class="page-content">
                        <div class="card">
                            <div class="card-header">
                                <h3>客户信息管理</h3>
                                <div>
                                    ${this.currentUser && (this.currentUser.roleId === 1 || this.currentUser.roleId === 2) ? `<button class="btn btn-success" id="import-customer-btn"><i class="fas fa-file-import"></i> 导入数据</button>` : ''}
                                    ${this.currentUser && (this.currentUser.roleId === 1 || this.currentUser.roleId === 2) ? `<button class="btn btn-warning" id="export-customer-btn"><i class="fas fa-file-export"></i> 导出数据</button>` : ''}
                                    <button class="btn-confirm" id="add-customer-btn"><i class="fas fa-plus"></i> 新增客户</button>
                                </div>
                            </div>
                            
                            <div class="customer-filter-bar" id="customer-filter-bar">
                                <!-- 筛选按钮将通过JavaScript动态生成 -->
                            </div>
                            
                            <div class="search-options">
                                <div class="search-option-label">
                                    <input type="radio" id="search-fuzzy" name="search-mode" value="fuzzy" ${this.searchMode === 'fuzzy' ? 'checked' : ''}>
                                    <label for="search-fuzzy">模糊搜索</label>
                                </div>
                                <div class="search-option-label">
                                    <input type="radio" id="search-exact" name="search-mode" value="exact" ${this.searchMode === 'exact' ? 'checked' : ''}>
                                    <label for="search-exact">完全匹配</label>
                                </div>
                            </div>
                            
                            <div class="search-container">
                                <input type="text" class="search-input" id="search-input" placeholder="搜索客户名称、手机、备注等信息..." value="${this.searchKeyword}">
                                <button class="btn btn-primary" id="search-btn"><i class="fas fa-search"></i> 搜索</button>
                                <button class="btn btn-primary" id="advanced-filter-btn" style="margin-left: 10px;"><i class="fas fa-filter"></i> 高级筛选</button>
                            </div>
                            
                            <div class="table-container">
                                <table id="customer-table">
                                    <thead>
                                        <tr>
                                            <th>客户名称</th>
                                            <th>接通状态</th>
                                            <th>手机</th>
                                            <th>客户级别</th>
                                            <th>备注</th>
                                            <th>更新时间</th>
                                            <th>负责人</th>
                                            <th>所属部门</th>
                                        </tr>
                                    </thead>
                                    <tbody id="customers-body">
                                        <!-- 动态填充 -->
                                    </tbody>
                                </table>
                            </div>
                            
                            <div class="pagination-container">
                                <div class="pagination-controls">
                                    <div class="pagination" id="pagination">
                                        <!-- 分页按钮将通过JavaScript动态生成 -->
                                    </div>
                                    
                                    <div class="page-size-selector">
                                        <select id="page-size-select">
                                            <option value="15" ${this.pageSize === 15 ? 'selected' : ''}>15条/页</option>
                                            <option value="30" ${this.pageSize === 30 ? 'selected' : ''}>30条/页</option>
                                            <option value="60" ${this.pageSize === 60 ? 'selected' : ''}>60条/页</option>
                                            <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100条/页</option>
                                        </select>
                                    </div>
                                    
                                    <div class="pagination-info">
                                        共 <strong>${visibleCustomers.length}</strong> 条
                                    </div>
                                    
                                    <div class="page-jumper">
                                        <span>前往</span>
                                        <input type="number" id="page-jump-input" min="1" value="${this.currentPageIndex}" style="width: 60px; margin: 0 5px; padding: 4px;">
                                        <span>页</span>
                                        <button id="page-jump-btn" style="margin-left: 5px; padding: 4px 10px;">跳转</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            },
            
            // 获取数据分发HTML
            getDataDistributionHTML: function() {
                return `
                    <div id="data-distribution" class="page-content">
                        <div class="card">
                            <div class="card-header">
                                <h3>数据分发管理</h3>
                                <button class="btn btn-primary" id="view-distribution-logs"><i class="fas fa-history"></i> 查看分发日志</button>
                            </div>
                            
                            <div class="search-container">
                                <input type="text" class="search-input" id="distribution-search" placeholder="搜索客户...">
                                <button class="btn btn-primary" id="distribution-search-btn"><i class="fas fa-search"></i> 搜索</button>
                                <button class="btn btn-danger" id="delete-selected-customers-btn" style="margin-left: 10px;"><i class="fas fa-trash"></i> 删除选中客户</button>
                            </div>
                            
                            <div class="table-container">
                                <table id="distribution-table">
                                    <thead>
                                        <tr>
                                            <th width="50"><input type="checkbox" id="select-all-customers"></th>
                                            <th>客户名称</th>
                                            <th>接通状态</th>
                                            <th>手机</th>
                                            <th>客户级别</th>
                                            <th>负责人</th>
                                            <th>所属部门</th>
                                        </tr>
                                    </thead>
                                    <tbody id="distribution-body">
                                        <!-- 动态填充 -->
                                    </tbody>
                                </table>
                            </div>
                            
                            <div style="margin-top: 20px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #eee;">
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <span><strong>已选择 <span id="selected-count">0</span> 个客户</strong></span>
                                    <select class="form-control" style="width: 200px;" id="target-employee">
                                        <option value="">选择目标员工</option>
                                        <!-- 员工选项将通过JavaScript动态生成 -->
                                    </select>
                                    <button class="btn btn-primary" id="distribute-btn" disabled><i class="fas fa-share-alt"></i> 分发选中客户</button>
                                </div>
                            </div>
                            
                            <div class="pagination-container">
                                <div class="pagination-info">
                                    共 <strong>0</strong> 条数据，当前显示第 <strong>1</strong> 页
                                </div>
                                
                                <div class="pagination-controls">
                                    <div class="page-size-selector">
                                        <span>单页最多显示</span>
                                        <select id="distribution-page-size">
                                            <option value="100" selected>100条/页</option>
                                        </select>
                                    </div>
                                    
                                    <div class="pagination" id="distribution-pagination">
                                        <!-- 分页按钮将通过JavaScript动态生成 -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            },
            
            // 获取账户管理HTML
            getAccountManagementHTML: function() {
                return `
                    <div id="account-management" class="page-content">
                        <div class="card">
                            <div class="card-header">
                                <h3>后台账户与权限管理</h3>
                                <button class="btn btn-primary" id="add-account-btn"><i class="fas fa-plus"></i> 新增账户</button>
                            </div>
                            
                            <div class="table-container">
                                <table id="account-table">
                                    <thead>
                                        <tr>
                                            <th>账号</th>
                                            <th>姓名</th>
                                            <th>岗位</th>
                                            <th>角色</th>
                                            <th>部门</th>
                                            <th>状态</th>
                                            <th>创建时间</th>
                                            <th>最后登录</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="account-body">
                                        <!-- 动态填充 -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="card-header">
                                <h3>操作日志</h3>
                            </div>
                            
                            <div class="table-container">
                                <table id="log-table">
                                    <thead>
                                        <tr>
                                            <th>时间</th>
                                            <th>操作人</th>
                                            <th>角色</th>
                                            <th>操作</th>
                                            <th>详情</th>
                                        </tr>
                                    </thead>
                                    <tbody id="log-body">
                                        <!-- 动态填充 -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
            },
            
            // 获取系统设置HTML
            getSystemSettingsHTML: function() {
                return `
                    <div id="system-settings" class="page-content">
                        <!-- 字段设置面板 -->
                        <div class="card">
                            <div class="card-header">
                                <h3>系统字段设置</h3>
                            </div>
                            
                            <div class="table-container">
                                <table id="system-fields-table">
                                    <thead>
                                        <tr>
                                            <th>字段名称</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>接通状态</td>
                                            <td>
                                                <button class="btn btn-sm btn-primary" onclick="crmApp.openFieldModal('callStatus')">编辑字段</button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>部门名称</td>
                                            <td>
                                                <button class="btn btn-sm btn-primary" onclick="crmApp.openFieldModal('department')">编辑字段</button>
                                            </td>
                                        </tr>

                                        <tr>
                                            <td>客户级别</td>
                                            <td>
                                                <button class="btn btn-sm btn-primary" onclick="crmApp.openFieldModal('customerLevel')">编辑字段</button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>岗位</td>
                                            <td>
                                                <button class="btn btn-sm btn-primary" onclick="crmApp.openFieldModal('position')">编辑字段</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- 组长管理面板 -->
                        <div class="card">
                            <div class="card-header">
                                <h3>组长及组内管理</h3>
                                <button class="btn btn-primary" id="add-group-leader-btn"><i class="fas fa-plus"></i> 添加组长</button>
                            </div>
                            
                            <div class="table-container">
                                <table id="group-leaders-table">
                                    <thead>
                                        <tr>
                                            <th>组长姓名</th>
                                            <th>所属部门</th>
                                            <th>组内员工</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="group-leaders-body">
                                        <!-- 动态生成组长列表 -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
            },
            
            // 获取个人资料HTML
            getProfileHTML: function() {
                const firstChar = this.currentUser.name ? this.currentUser.name.charAt(0) : 'U';
                
                return `
                    <div id="profile" class="page-content">
                        <div class="card">
                            <div style="display: flex; align-items: center; gap: 30px; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
                                <div style="position: relative;">
                                    <div class="avatar-circle" style="width: 80px; height: 80px; font-size: 2rem; background-color: ${this.currentUser.avatarColor || '#4361ee'}">
                                        ${firstChar}
                                    </div>
                                </div>
                                <div>
                                    <h2 style="margin-bottom: 5px;">${this.currentUser.name || this.currentUser.username}</h2>
                                    <p style="color: #666;">${this.currentUser.position ? this.currentUser.position + ' | ' : ''}${this.roles[this.currentUser.roleId] || '组员'}</p>
                                    <p style="margin-top: 5px; font-size: 0.9rem; color: #777;">账户: ${this.currentUser.username}</p>
                                </div>
                            </div>
                            
                            <form id="profile-form">
                                <div style="margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                                    <h3 style="font-size: 1.2rem;">基本信息</h3>
                                </div>
                                
                                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                                    <div style="flex: 1;">
                                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #555;">姓名</label>
                                        <input type="text" id="profile-name" style="width: 100%; padding: 12px 15px; border: 1px solid #ddd; border-radius: 5px;" value="${this.currentUser.name || ''}" required>
                                    </div>
                                    
                                    <div style="flex: 1;">
                                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #555;">账户</label>
                                        <input type="text" style="width: 100%; padding: 12px 15px; border: 1px solid #ddd; border-radius: 5px;" value="${this.currentUser?.username || ''}" readonly>
                                    </div>
                                </div>
                                
                                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                                    <div style="flex: 1;">
                                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #555;">岗位</label>
                                        <input type="text" id="profile-position" style="width: 100%; padding: 12px 15px; border: 1px solid #ddd; border-radius: 5px;" value="${this.currentUser.position || ''}">
                                    </div>
                                    
                                    <div style="flex: 1;">
                                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #555;">部门</label>
                                        <input type="text" id="profile-department" style="width: 100%; padding: 12px 15px; border: 1px solid #ddd; border-radius: 5px;" value="${this.currentUser.department || ''}" ${this.currentUser.roleId !== 1 ? 'readonly' : ''}>
                                    </div>
                                </div>
                                
                                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 15px;">
                                    <button type="button" class="btn" style="background-color: #f8f9fa; color: #212529;" id="cancel-profile-btn">取消</button>
                                    <button type="submit" class="btn btn-primary">保存修改</button>
                                </div>
                            </form>
                        </div>
                    </div>
                `;
            },
            
            // 获取编辑客户模态框HTML
            getEditCustomerModalHTML: function(customer) {
                const isEdit = !!customer;
                const customerData = customer || {
                    id: 0,
                    name: '',
                    callStatus: '',
                    phone: '',
                    customerLevel: '',
                    notes: '',
                    owner: this.currentUser.name || '张经理',
                    department: this.currentUser.department || '销售部'
                };
                
                // 判断当前用户是否为管理员
                const isAdmin = this.currentUser.roleId === 1;
                
                // 生成负责人选项
                let ownerOptions = '';
                this.accounts.forEach(account => {
                    const selected = customerData.owner === account.name ? 'selected' : '';
                    ownerOptions += `<option value="${account.name}" ${selected}>${account.name}</option>`;
                });
                
                return `
                    <form id="edit-customer-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">客户名称 <span style="color: #f72585;">*</span></label>
                                <input type="text" class="form-control" id="edit-customer-name" value="${customerData.name}" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">接通状态</label>
                                <div style="position: relative;">
                                    <input type="text" class="form-control" id="edit-call-status" style="padding-right: 30px;" value="${customerData.callStatus}" oninput="validateCallStatus(this)" onclick="showCallStatusOptions(event)">
                                    <button type="button" class="close-modal" style="position: absolute; right: 15px; top: 45%; transform: translateY(-50%); display: ${customerData.callStatus === '' ? 'none' : 'block'};" onclick="event.stopPropagation(); document.getElementById('edit-call-status').value = '';
                                        this.style.display = 'none';">
                                        ×
                                    </button>
                                    <div id="call-status-options" class="dropdown-options" style="display: none;">
                                        <div class="dropdown-option" onclick="selectCallStatus('已接通')">已接通</div>
                                        <div class="dropdown-option" onclick="selectCallStatus('未接通')">未接通</div>
                                        <div class="dropdown-option" onclick="selectCallStatus('忙线')">忙线</div>
                                        <div class="dropdown-option" onclick="selectCallStatus('无人接听')">无人接听</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">手机号码 <span style="color: #f72585;">*</span></label>
                                <input type="text" class="form-control" id="edit-phone" value="${customerData.phone}" required ${isAdmin ? '' : 'readonly="readonly"'} oninput="filterDigitsOnly(this);">
                            </div>
                            <div class="form-group">
                                <label class="form-label">客户级别</label>
                                <div style="position: relative;">
                                    <input type="text" class="form-control" id="edit-customer-level" style="padding-right: 30px;" value="${customerData.customerLevel}" oninput="validateCustomerLevel(this)" onclick="showCustomerLevelOptions(event)">
                                    <button type="button" class="close-modal" style="position: absolute; right: 15px; top: 45%; transform: translateY(-50%); display: ${customerData.customerLevel === '' ? 'none' : 'block'};" onclick="event.stopPropagation(); document.getElementById('edit-customer-level').value = '';
                                        this.style.display = 'none';">
                                        ×
                                    </button>
                                    <div id="customer-level-options" class="dropdown-options" style="display: none;">
                                        <div class="dropdown-option" onclick="selectCustomerLevel('A类客户')">A类客户</div>
                                        <div class="dropdown-option" onclick="selectCustomerLevel('B类客户')">B类客户</div>
                                        <div class="dropdown-option" onclick="selectCustomerLevel('C类客户')">C类客户</div>
                                        <div class="dropdown-option" onclick="selectCustomerLevel('黑名单')">黑名单</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">负责人</label>
                                <select class="form-control" id="edit-owner" ${isAdmin ? '' : 'disabled="disabled"'}>
                                    ${ownerOptions}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">所属部门</label>
                                <div class="custom-select-wrapper">
                                    <input type="text" id="edit-department" class="form-control" placeholder="请输入部门" value="${customerData.department || ''}" ${isAdmin ? '' : 'readonly'}>
                                    <div class="custom-select-dropdown" id="edit-department-dropdown" ${isAdmin ? '' : 'style="display: none"'}>
                                        <!-- 动态生成部门选项 -->
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">备注</label>
                            <textarea class="form-control" id="edit-notes" rows="3">${customerData.notes || ''}</textarea>
                        </div>
                        
                        <input type="hidden" id="edit-customer-id" value="${customerData.id}">
                    </form>
                `;
            },
            
            // 获取当前用户能看到的客户
            getVisibleCustomers: function() {
                const roleId = this.currentUser.roleId;
                
                if (roleId === 1) {
                    // 超级管理员可以看到所有客户
                    return this.customers;
                } else if (roleId === 2) {
                    // 组内管理员只能看到本组客户
                    return this.customers.filter(c => c.department === this.currentUser.department);
                } else {
                    // 组员只能看到自己的客户
                    return this.customers.filter(c => c.owner === this.currentUser.name);
                }
            },
            
            // 获取筛选后的客户列表
            getFilteredCustomers: function() {
                let filteredCustomers = this.getVisibleCustomers();
                
                // 根据当前筛选条件过滤
                if (this.currentFilter && this.currentFilter !== '全部') {
                    // 查找当前筛选条件对应的场景
                    const currentScenario = this.scenarios.find(s => s.name === this.currentFilter);
                    
                    if (currentScenario && currentScenario.conditions && currentScenario.conditions.length > 0) {
                        // 应用场景条件过滤
                        filteredCustomers = filteredCustomers.filter(customer => {
                            return currentScenario.conditions.every(condition => {
                                const { field, operator, value } = condition;
                                
                                // 字段映射：界面显示的字段名 -> 实际客户对象的字段名
                                const fieldMap = {
                                    'customerName': 'name',
                                    'callStatus': 'callStatus',
                                    'phoneNumber': 'phone',
                                    'customerLevel': 'customerLevel',
                                    'remark': 'notes',
                                    'updateTime': 'updateTime',
                                    'owner': 'owner',
                                    'department': 'department'
                                };
                                
                                // 获取实际客户对象的字段值
                                const actualField = fieldMap[field] || field;
                                const customerValue = customer[actualField] || '';
                                
                                switch (operator) {
                                    case '=':
                                        return customerValue === value;
                                    case '!=':
                                        return customerValue !== value;
                                    case 'contains':
                                        return customerValue.toLowerCase().includes(value.toLowerCase());
                                    default:
                                        return true;
                                }
                            });
                        });
                    } else if (this.currentFilter === '新资源') {
                        filteredCustomers = filteredCustomers.filter(c => c.customerLevel === '新资源');
                    } else if (this.currentFilter === 'A类客户') {
                        filteredCustomers = filteredCustomers.filter(c => c.customerLevel === 'A类客户');
                    } else if (this.currentFilter === 'B类客户') {
                        filteredCustomers = filteredCustomers.filter(c => c.customerLevel === 'B类客户');
                    } else if (this.currentFilter === 'C类客户') {
                        filteredCustomers = filteredCustomers.filter(c => c.customerLevel === 'C类客户');
                    } else if (this.currentFilter === '黑名单') {
                        filteredCustomers = filteredCustomers.filter(c => c.customerLevel === '黑名单');
                    }
                }
                // "全部"不进行额外过滤
                
                // 应用搜索过滤
                if (this.searchKeyword) {
                    const keyword = this.searchKeyword.toLowerCase();
                    
                    if (this.searchMode === 'exact') {
                        // 完全匹配
                        filteredCustomers = filteredCustomers.filter(c => 
                            c.name === keyword || 
                            c.phone === keyword || 
                            c.notes === keyword ||
                            c.owner === keyword ||
                            c.department === keyword
                        );
                    } else {
                        // 模糊搜索
                        filteredCustomers = filteredCustomers.filter(c => 
                            (c.name && c.name.toLowerCase().includes(keyword)) || 
                            (c.phone && c.phone.includes(keyword)) || 
                            (c.notes && c.notes.toLowerCase().includes(keyword)) ||
                            (c.owner && c.owner.toLowerCase().includes(keyword)) ||
                            (c.department && c.department.toLowerCase().includes(keyword))
                        );
                    }
                }
                
                // 应用高级筛选条件
                if (this.advancedFilterConditions && this.advancedFilterConditions.length > 0) {
                    filteredCustomers = filteredCustomers.filter(customer => {
                        return this.advancedFilterConditions.every(condition => {
                            const { field, operator, value } = condition;
                            
                            // 字段映射：界面显示的字段名 -> 实际客户对象的字段名
                            const fieldMap = {
                                'customerName': 'name',
                                'callStatus': 'callStatus',
                                'phoneNumber': 'phone',
                                'customerLevel': 'customerLevel',
                                'remark': 'notes',
                                'updateTime': 'updateTime',
                                'owner': 'owner',
                                'department': 'department'
                            };
                            
                            // 获取实际客户对象的字段值
                            const actualField = fieldMap[field] || field;
                            const customerValue = customer[actualField] || '';
                            
                            switch (operator) {
                                case '=':
                                case 'equals':
                                    return customerValue.toString().toLowerCase() === value.toLowerCase();
                                case '!=':
                                case 'notEquals':
                                    return customerValue.toString().toLowerCase() !== value.toLowerCase();
                                case 'contains':
                                    return customerValue.toString().toLowerCase().includes(value.toLowerCase());
                                case 'greaterThan':
                                    return parseFloat(customerValue) > parseFloat(value);
                                case 'lessThan':
                                    return parseFloat(customerValue) < parseFloat(value);
                                case 'startsWith':
                                    return customerValue.toString().toLowerCase().startsWith(value.toLowerCase());
                                case 'endsWith':
                                    return customerValue.toString().toLowerCase().endsWith(value.toLowerCase());
                                default:
                                    return true;
                            }
                        });
                    });
                }
                
                return filteredCustomers;
            },
            
            // 初始化页面
            initPage: function(page) {
                console.log('初始化页面:', page);
                
                switch(page) {
                    case 'dashboard':
                        this.initDashboard();
                        break;
                    case 'customer-management':
                        this.initCustomerManagement();
                        break;
                    case 'data-distribution':
                        this.initDataDistribution();
                        break;
                    case 'account-management':
                        this.initAccountManagement();
                        break;
                    case 'system-settings':
                        this.initSystemSettings();
                        break;
                    case 'profile':
                        this.initProfile();
                        break;
                }
            },
            
            // 初始化仪表盘
            initDashboard: function() {
                console.log('初始化仪表盘');
                this.updateRecentCustomers();
                
                // 查看全部按钮
                document.getElementById('view-all-customers')?.addEventListener('click', () => {
                    this.loadPage('customer-management');
                });
                
                // 查看详情按钮（组管理员）
                document.getElementById('view-group-details')?.addEventListener('click', () => {
                    this.showAlert('组员详情', '此功能显示组内每位成员的详细数据，包括下发、外呼、接通、接通率等指标。');
                });
            },
            
            // 初始化客户管理
            initCustomerManagement: function() {
    console.log('初始化客户管理');
    
    // 加载默认场景设置
    const defaultScenario = localStorage.getItem('crm_default_scenario');
    this.currentFilter = defaultScenario || '';
    
    this.displayFilterButtons();
    this.displayCustomers();
    this.setupPagination();
    
    // 绑定事件
    document.getElementById('import-customer-btn')?.addEventListener('click', () => {
        this.showImportCustomerModal();
    });
    
    document.getElementById('export-customer-btn')?.addEventListener('click', () => {
        this.exportCustomers();
    });
                
                // 绑定新增客户按钮事件
                document.getElementById('add-customer-btn')?.addEventListener('click', () => {
                    this.showEditCustomerModal(null);
                });
                
                // 绑定搜索事件
                document.getElementById('search-btn')?.addEventListener('click', () => {
                    this.searchKeyword = document.getElementById('search-input').value.trim();
                    this.currentPageIndex = 1;
                    this.displayCustomers();
                    this.setupPagination();
                });
                
                // 绑定高级筛选按钮事件
                document.getElementById('advanced-filter-btn')?.addEventListener('click', () => {
                    this.showAdvancedFilterModal();
                });
                

                
                // 绑定搜索模式切换
                document.querySelectorAll('input[name="search-mode"]').forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        this.searchMode = e.target.value;
                        if (this.searchKeyword) {
                            this.currentPageIndex = 1;
                            this.displayCustomers();
                            this.setupPagination();
                        }
                    });
                });
                
                // 绑定每页显示数量更改事件
                document.getElementById('page-size-select')?.addEventListener('change', (e) => {
                    this.pageSize = parseInt(e.target.value);
                    this.currentPageIndex = 1;
                    this.displayCustomers();
                    this.setupPagination();
                });
                
                // 绑定搜索框回车事件
                document.getElementById('search-input')?.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.searchKeyword = document.getElementById('search-input').value.trim();
                        this.currentPageIndex = 1;
                        this.displayCustomers();
                        this.setupPagination();
                    }
                });
            },
            
            // 初始化数据分发
            initDataDistribution: function() {
                console.log('初始化数据分发');
                this.displayDistributionCustomers();
                this.setupDistributionPagination();
                
                // 绑定全选事件
                document.getElementById('select-all-customers')?.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    document.querySelectorAll('.customer-checkbox').forEach(checkbox => {
                        checkbox.checked = isChecked;
                    });
                    this.updateSelectedCount();
                });
                
                // 绑定分发按钮事件
                document.getElementById('distribute-btn')?.addEventListener('click', () => {
                    this.distributeCustomers();
                });
                
                // 绑定查看分发日志事件
                document.getElementById('view-distribution-logs')?.addEventListener('click', () => {
                    this.showDistributionLogs();
                });
                
                // 初始化目标员工下拉框
                this.populateTargetEmployees();
                
                // 绑定删除选中客户按钮事件
                document.getElementById('delete-selected-customers-btn')?.addEventListener('click', () => {
                    this.deleteSelectedCustomers();
                });
            },
            
            // 初始化账户管理
            initAccountManagement: function() {
                console.log('初始化账户管理');
                this.displayAccounts();
                this.displayLogs();
                
                // 绑定新增账户按钮事件
                document.getElementById('add-account-btn')?.addEventListener('click', () => {
                    this.showCreateAccountModal();
                });
            },
            
            // 初始化系统设置
            initSystemSettings: function() {
    console.log('初始化系统设置');
    
    // 绑定添加字段按钮事件
    document.getElementById('add-custom-field-btn')?.addEventListener('click', () => {
        this.showAlert('添加字段', '此功能允许管理员在客户编辑表单中添加新字段。');
    });
    
    // 绑定系统设置表单提交事件
    document.getElementById('system-settings-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.showNotification('系统配置已保存', 'success');
    });
     // 新增：绑定“添加组长”按钮事件
    const addGroupLeaderBtn = document.getElementById('add-group-leader-btn');
    if (addGroupLeaderBtn) {
        console.log('找到添加组长按钮，绑定事件');
        // 使用cloneNode移除旧的事件监听器，避免重复绑定
        const newBtn = addGroupLeaderBtn.cloneNode(true);
        addGroupLeaderBtn.parentNode.replaceChild(newBtn, addGroupLeaderBtn);
        
        newBtn.addEventListener('click', () => {
            console.log('点击添加组长按钮');
            this.showGroupLeaderModal();
        });
    } else {
        console.error('未找到添加组长按钮');
    }
    
    // 初始化组长列表
    this.displayGroupLeaders();
},
            
            // 初始化个人资料
            initProfile: function() {
                console.log('初始化个人资料');
                
                // 取消按钮
                document.getElementById('cancel-profile-btn')?.addEventListener('click', () => {
                    this.loadPage('dashboard');
                });
                
                // 表单提交
                document.getElementById('profile-form')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveProfile();
                });
            },
            
            // 显示筛选按钮
            displayFilterButtons: function() {
                console.log('displayFilterButtons函数被调用');
                const filterBar = document.getElementById('customer-filter-bar');
                if (!filterBar) {
                    console.error('customer-filter-bar元素不存在');
                    return;
                }
                console.log('customer-filter-bar元素存在:', filterBar);
                console.log('当前scenarios数据:', this.scenarios);
                console.log('当前scenarios数量:', this.scenarios.length);
                
                let filterHTML = '';
                
                // 为每个场景创建按钮
                this.scenarios.forEach(scenario => {
                    // 确保scenario是字符串
                    const scenarioName = typeof scenario === 'string' ? scenario : (scenario.name || String(scenario));
                    
                    // 跳过场景设置选项（单独作为按钮）
                    if (scenarioName === '场景设置') return;
                    
                    // 为不同场景添加不同的样式类
                    let btnClass = 'filter-btn';
                    if (scenarioName === '新资源') btnClass += ' new-resource';
                    else if (scenarioName === 'A类客户') btnClass += ' a-level';
                    else if (scenarioName === 'B类客户') btnClass += ' b-level';
                    else if (scenarioName === 'C类客户') btnClass += ' c-level';
                    else if (scenarioName === '黑名单') btnClass += ' blacklist';
                    
                    // 为当前选中的场景添加active类
                    if (this.currentFilter === scenarioName) btnClass += ' active';
                    
                    // 添加按钮HTML
                    filterHTML += `<button class="${btnClass}" id="filter-btn-${scenarioName}">${scenarioName}</button>`;
                });
                
                // 添加场景设置按钮
                console.log('添加场景设置按钮');
                filterHTML += `<button class="filter-btn settings" id="scenario-settings-btn"><i class="fas fa-cog"></i> 场景设置</button>`;
                
                console.log('生成的filterHTML:', filterHTML);
                filterBar.innerHTML = filterHTML;
                console.log('filterBar.innerHTML设置后:', filterBar.innerHTML);
                
                // 绑定所有筛选按钮点击事件
                this.scenarios.forEach(scenario => {
                    const scenarioName = typeof scenario === 'string' ? scenario : (scenario.name || String(scenario));
                    if (scenarioName === '场景设置') return;
                    
                    const filterBtn = document.getElementById(`filter-btn-${scenarioName}`);
                    filterBtn.addEventListener('click', () => {
                        // 设置当前筛选条件
                        this.currentFilter = scenarioName;
                        this.currentPageIndex = 1; // 重置到第一页
                        
                        // 重新显示客户和分页
                        this.displayCustomers();
                        this.setupPagination();
                        
                        // 更新按钮激活状态
                        this.displayFilterButtons();
                    });
                });
                
                // 绑定场景设置按钮点击事件
                const settingsBtn = document.getElementById('scenario-settings-btn');
                console.log('场景设置按钮是否存在:', !!settingsBtn);
                if (settingsBtn) {
                    console.log('绑定场景设置按钮点击事件');
                    settingsBtn.addEventListener('click', () => {
                        this.showScenarioSettingsModal();
                    });
                } else {
                    console.error('scenario-settings-btn元素不存在');
                    // 检查filter-bar的可见性
                    console.log('filterBar样式:', {
                        display: window.getComputedStyle(filterBar).display,
                        visibility: window.getComputedStyle(filterBar).visibility,
                        opacity: window.getComputedStyle(filterBar).opacity
                    });
                }
            },
            
            // 显示客户列表
            displayCustomers: function() {
                const tbody = document.getElementById('customers-body');
                if (!tbody) return;
                
                tbody.innerHTML = '';
                
                // 获取筛选后的客户
                const filteredCustomers = this.getFilteredCustomers();
                
                // 计算分页数据
                const startIndex = (this.currentPageIndex - 1) * this.pageSize;
                const endIndex = Math.min(startIndex + this.pageSize, filteredCustomers.length);
                const pageCustomers = filteredCustomers.slice(startIndex, endIndex);
                
                if (pageCustomers.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="8" style="text-align: center; padding: 40px; color: #999;">
                                <i class="fas fa-users" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                                <h3>暂无客户数据</h3>
                                <p>点击"新增客户"按钮添加第一个客户</p>
                            </td>
                        </tr>
                    `;
                } else {
                    pageCustomers.forEach(customer => {
                        const row = document.createElement('tr');
                        row.setAttribute('data-id', customer.id);
                        
                        // 根据接通状态设置样式类
                        let callStatusClass = '';
                        if (customer.callStatus === '已接通') callStatusClass = 'call-status-connected';
                        else if (customer.callStatus === '未接听') callStatusClass = 'call-status-no-answer';
                        else if (customer.callStatus === '空号' || customer.callStatus === '关机' || customer.callStatus === '拒接') callStatusClass = 'call-status-wrong-number';
                        
                        // 根据客户级别设置样式类
                        let levelClass = '';
                        if (customer.customerLevel === 'A类客户') levelClass = 'level-a';
                        else if (customer.customerLevel === 'B类客户') levelClass = 'level-b';
                        else if (customer.customerLevel === 'C类客户') levelClass = 'level-c';
                        else if (customer.customerLevel === '新资源') levelClass = 'level-new';
                        else if (customer.customerLevel === '黑名单') levelClass = 'level-blacklist';
                        
                        // 确保所有字段都有值
                        const name = customer.name || '';
                        const callStatus = customer.callStatus || '';
                        const phone = customer.phone || '';
                        const customerLevel = customer.customerLevel || '';
                        const notes = customer.notes || '';
                        const updateTime = customer.updateTime || '';
                        const owner = customer.owner || '';
                        const department = customer.department || '';
                        
                        row.innerHTML = `
                            <td>${name}</td>
                            <td><span class="${callStatusClass}">${callStatus}</span></td>
                            <td>${phone}</td>
                            <td><span class="level-badge ${levelClass}">${customerLevel}</span></td>
                            <td>${notes ? (notes.length > 20 ? notes.substring(0, 20) + '...' : notes) : ''}</td>
                            <td>${updateTime}</td>
                            <td>${owner}</td>
                            <td>${department}</td>
                        `;
                        tbody.appendChild(row);
                    });
                    
                    // 添加行点击事件（弹出编辑窗口）
                    tbody.querySelectorAll('tr').forEach(row => {
                        row.addEventListener('click', (e) => {
                            // 防止点击操作按钮时触发
                            if (!e.target.closest('.action-btn')) {
                                const id = parseInt(row.getAttribute('data-id'));
                                const customer = this.customers.find(c => c.id === id);
                                if (customer) {
                                    this.showEditCustomerModal(customer);
                                }
                            }
                        });
                    });
                }
                
                // 更新分页信息
                this.updatePaginationInfo();
            },
            
            // 显示数据分发客户列表
            displayDistributionCustomers: function() {
                const tbody = document.getElementById('distribution-body');
                if (!tbody) return;
                
                tbody.innerHTML = '';
                
                // 获取当前用户能分发的客户
                // 管理员可以分发所有客户，组管理员可以分发本组客户
                let distributableCustomers = [];
                if (this.currentUser.roleId === 1) {
                    // 超级管理员
                    distributableCustomers = this.customers;
                } else if (this.currentUser.roleId === 2) {
                    // 组内管理员
                    distributableCustomers = this.customers.filter(c => c.department === this.currentUser.department);
                } else {
                    // 组员没有分发权限
                    distributableCustomers = [];
                }
                
                // 分页数据
                const pageSize = 100;
                const startIndex = (this.currentPageIndex - 1) * pageSize;
                const endIndex = Math.min(startIndex + pageSize, distributableCustomers.length);
                const pageCustomers = distributableCustomers.slice(startIndex, endIndex);
                
                if (pageCustomers.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                                <i class="fas fa-users" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                                <h3>暂无客户数据</h3>
                                <p>没有可分发的客户数据</p>
                            </td>
                        </tr>
                    `;
                } else {
                    pageCustomers.forEach(customer => {
                        const row = document.createElement('tr');
                        row.setAttribute('data-id', customer.id);
                        
                        // 根据客户级别设置样式类
                        let levelClass = '';
                        if (customer.customerLevel === 'A类客户') levelClass = 'level-a';
                        else if (customer.customerLevel === 'B类客户') levelClass = 'level-b';
                        else if (customer.customerLevel === 'C类客户') levelClass = 'level-c';
                        else if (customer.customerLevel === '新资源') levelClass = 'level-new';
                        else if (customer.customerLevel === '黑名单') levelClass = 'level-blacklist';
                        
                        row.innerHTML = `
                            <td><input type="checkbox" class="customer-checkbox" data-id="${customer.id}"></td>
                            <td>${customer.name || ''}</td>
                            <td><span>${customer.callStatus || ''}</span></td>
                            <td>${customer.phone || ''}</td>
                            <td><span class="level-badge ${levelClass}">${customer.customerLevel || ''}</span></td>
                            <td>${customer.owner || ''}</td>
                            <td>${customer.department || ''}</td>
                        `;
                        tbody.appendChild(row);
                    });
                    
                    // 绑定复选框点击事件
                    document.querySelectorAll('.customer-checkbox').forEach(checkbox => {
                        checkbox.addEventListener('change', () => {
                            this.updateSelectedCount();
                        });
                    });
                }
                
                // 更新分页信息
                this.updateDistributionPaginationInfo(distributableCustomers.length);
            },
            
            displayAccounts: function() {
    const tbody = document.getElementById('account-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    this.accounts.forEach(account => {
        const row = document.createElement('tr');
        
        // 根据状态设置样式
        let statusBadge = '';
        if (account.status === 'active') {
            statusBadge = '<span class="status-badge status-active">激活</span>';
        } else {
            statusBadge = '<span class="status-badge status-inactive">停用</span>';
        }
        
        // 角色显示
        const roleName = this.roles[account.roleId] || account.role;
        
        // 确保username有值，如果没有则显示空字符串
        const username = account.username || account.username === 0 ? String(account.username) : '';
        
        row.innerHTML = `
            <td>${username}</td>
            <td>${account.name || ''}</td>
            <td>${account.position || ''}</td>
            <td>${roleName}</td>
            <td>${account.department || ''}</td>
            <td>${statusBadge}</td>
            <td>${account.createdAt ? this.formatDateTime(account.createdAt) : ''}</td>
            <td>${account.lastLogin ? this.formatDateTime(account.lastLogin) : ''}</td>
            <td>
                ${this.currentUsername === '10000' ? (username === '10000' ? `<button class="btn btn-sm btn-warning" data-id="${account.id}" onclick="CRMApp.openEditAccountModal(${account.id})">编辑</button>` : '') : ''}
                ${this.currentUsername !== '10000' ? (roleName === '超级管理员' ? (username !== '10000' ? `<button class="btn btn-sm btn-warning" data-id="${account.id}" onclick="CRMApp.openEditAccountModal(${account.id})">编辑</button>` : '') : `<button class="btn btn-sm btn-warning" data-id="${account.id}" onclick="CRMApp.openEditAccountModal(${account.id})">编辑</button>`) : ''}
                ${this.currentUsername !== '10000' ? (roleName === '超级管理员' ? (username !== '10000' ? `<button class="btn btn-sm btn-danger" data-id="${account.id}" onclick="CRMApp.deleteAccount(${account.id})">删除</button>` : '') : `<button class="btn btn-sm btn-danger" data-id="${account.id}" onclick="CRMApp.deleteAccount(${account.id})">删除</button>`) : ''}
            </td>
        `;
        tbody.appendChild(row);
    });
},
            
            // 打开编辑账户模态框
            openEditAccountModal: function(accountId) {
    const account = this.accounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    // 填充表单数据 - 使用更高效的方式
    const modal = document.getElementById('edit-account-modal');
    const elements = {
        id: 'edit-account-id',
        username: 'edit-account-username',
        password: 'edit-account-password',
        name: 'edit-account-name',
        position: 'edit-account-position',
        role: 'edit-account-role',
        status: 'edit-account-status'
    };
    
    // 批量设置值
    for (const [key, id] of Object.entries(elements)) {
        const element = document.getElementById(id);
        if (element) {
            // 使用上次选择的默认值或账户原有值
            // 对于角色字段，特殊处理，因为账户对象中存储的是roleId而不是role
            let value;
            if (key === 'role') {
                value = this.lastEditDefaults[key] || account.roleId || '';
            } else {
                value = this.lastEditDefaults[key] || account[key] || '';
            }
            element.value = value;
        }
    }
    
    // 填充部门自定义下拉列表
    const departmentInput = document.getElementById('edit-account-department');
    const dropdown = document.getElementById('edit-account-department-dropdown');
    if (departmentInput && dropdown) {
        // 清空现有选项
        dropdown.innerHTML = '';
        
        // 获取所有唯一部门
        const departments = this.getUniqueDepartments();
        
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
    }    
        // 使用上次选择的默认值或账户原有部门
        const departmentSelect = document.getElementById('edit-account-department');
        if (departmentSelect) {
            departmentSelect.value = this.lastEditDefaults.department || account.department || '';
        }
    



    
    // 显示模态框（优化动画性能）
    modal.style.display = 'flex';
    
    // 使用微任务确保DOM更新后再执行后续操作
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
},
            
            // 切换密码可见性
            togglePasswordVisibility: function(inputId) {
                const passwordInput = document.getElementById(inputId);
                const toggleIcon = passwordInput.nextElementSibling;
                
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    toggleIcon.textContent = '🙈';
                } else {
                    passwordInput.type = 'password';
                    toggleIcon.textContent = '👁️';
                }
            },
            
            // 显示确认弹窗
            showConfirmModal: function(title, message, callback) {
                document.getElementById('confirm-title').textContent = title || '确认操作';
                document.getElementById('confirm-message').textContent = message || '您确定要执行此操作吗？';
                this.confirmCallback = callback;
                document.getElementById('custom-confirm-modal').style.display = 'flex';
            },
            
            // 删除账户
            deleteAccount: function(accountId) {
                this.showConfirmModal('删除账户', '确定要删除此账户吗？此操作不可恢复。', async () => {
                    try {
                        await this.deleteAccountAPI(accountId);
                        this.showNotification('账户已成功删除', 'success');
                    } catch (e) {
                        this.showNotification(e.message || '删除账户失败', 'error');
                    }
                });
            },
            
            // 保存编辑后的账户
            saveEditAccount: async function() {
                const accountId = parseInt(document.getElementById('edit-account-id').value);
                const username = document.getElementById('edit-account-username').value.trim();
                const password = document.getElementById('edit-account-password').value.trim();
                const name = document.getElementById('edit-account-name').value.trim();
                const department = document.getElementById('edit-account-department').value.trim();
                const position = document.getElementById('edit-account-position').value.trim();
                const roleId = parseInt(document.getElementById('edit-account-role').value);
                const status = document.getElementById('edit-account-status').value;
                
                // 保存当前选择的默认值
                this.lastEditDefaults = {
                    department,
                    position,
                    role: roleId,
                    status,
                    password
                };
                
                // 验证必填字段
                if (!username || !name) {
                    this.showNotification('账号和姓名不能为空', 'error');
                    return;
                }
                
                try {
                    // 调用API更新账户
                    const accountData = {
                        username,
                        name,
                        department,
                        position,
                        roleId,
                        status
                    };
                    
                    // 如果填写了新密码，则包含在请求中
                    if (password) {
                        accountData.password = password;
                    }
                    
                    const result = await this.updateAccount(accountId, accountData);
                    
                    // 关闭模态框
                    this.closeModal('edit-account-modal');
                    this.showNotification('账户信息已成功更新', 'success');
                } catch (e) {
                    this.showNotification(e.message || '更新账户失败', 'error');
                }
            },
            
            // 显示日志列表
            displayLogs: function() {
                const tbody = document.getElementById('log-body');
                if (!tbody) return;
                
                tbody.innerHTML = '';
                
                // 显示最近50条日志
                const recentLogs = this.logs.slice(-50).reverse();
                
                if (recentLogs.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="5" style="text-align: center; padding: 40px; color: #999;">
                                <i class="fas fa-history" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                                <h3>暂无操作日志</h3>
                            </td>
                        </tr>
                    `;
                } else {
                    recentLogs.forEach(log => {
                        const row = document.createElement('tr');
                        const roleName = this.roles[log.userRole] || '';
                        
                        row.innerHTML = `
                            <td>${log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}</td>
                            <td>${log.userName || ''}</td>
                            <td>${roleName}</td>
                            <td>${log.action || ''}</td>
                            <td>${log.details || ''}</td>
                        `;
                        tbody.appendChild(row);
                    });
                }
            },
            
            // 更新最近客户
            updateRecentCustomers: function() {
                const tbody = document.getElementById('recent-customers-body');
                if (!tbody) return;
                
                tbody.innerHTML = '';
                
                // 根据用户角色筛选客户
                const customersToShow = this.getVisibleCustomers();
                
                // 按更新时间排序，取前5个
                const recentCustomers = [...customersToShow]
                    .sort((a, b) => {
                        const dateA = a.updateTime ? new Date(a.updateTime) : new Date(0);
                        const dateB = b.updateTime ? new Date(b.updateTime) : new Date(0);
                        return dateB - dateA;
                    })
                    .slice(0, 5);
                
                if (recentCustomers.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center; padding: 20px; color: #999;">
                                暂无最近更新的客户
                            </td>
                        </tr>
                    `;
                } else {
                    recentCustomers.forEach(customer => {
                        const row = document.createElement('tr');
                        
                        // 根据接通状态设置样式类
                        let callStatusClass = '';
                        if (customer.callStatus === '已接通') callStatusClass = 'call-status-connected';
                        else if (customer.callStatus === '未接听') callStatusClass = 'call-status-no-answer';
                        else if (customer.callStatus === '空号' || customer.callStatus === '关机' || customer.callStatus === '拒接') callStatusClass = 'call-status-wrong-number';
                        
                        // 根据客户级别设置样式类
                        let levelClass = '';
                        if (customer.customerLevel === 'A类客户') levelClass = 'level-a';
                        else if (customer.customerLevel === 'B类客户') levelClass = 'level-b';
                        else if (customer.customerLevel === 'C类客户') levelClass = 'level-c';
                        else if (customer.customerLevel === '新资源') levelClass = 'level-new';
                        else if (customer.customerLevel === '黑名单') levelClass = 'level-blacklist';
                        
                        row.innerHTML = `
                            <td>${customer.name || ''}</td>
                            <td><span class="${callStatusClass}">${customer.callStatus || ''}</span></td>
                            <td>${customer.phone || ''}</td>
                            <td><span class="level-badge ${levelClass}">${customer.customerLevel || ''}</span></td>
                            <td>${customer.updateTime || ''}</td>
                            <td>${this.currentUser.roleId === 3 ? '' : (customer.owner || '')}</td>
                        `;
                        tbody.appendChild(row);
                    });
                }
            },
            
            // 设置分页
            setupPagination: function() {
                const pagination = document.getElementById('pagination');
                if (!pagination) return;
                
                const filteredCustomers = this.getFilteredCustomers();
                const totalPages = Math.ceil(filteredCustomers.length / this.pageSize);
                
                // 如果只有一页或没有数据，不显示分页
                if (totalPages <= 1) {
                    pagination.innerHTML = '';
                    return;
                }
                
                let paginationHTML = '';
                
                // 上一页按钮
                paginationHTML += `
                    <button class="pagination-btn ${this.currentPageIndex === 1 ? 'disabled' : ''}" data-page="prev">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                `;
                
                // 页码按钮
                // 显示前5页和最后一页，中间用省略号分隔
                let pageButtons = [];
                
                // 添加前5页
                for (let i = 1; i <= Math.min(5, totalPages); i++) {
                    pageButtons += `
                        <button class="pagination-btn ${i === this.currentPageIndex ? 'active' : ''}" data-page="${i}">
                            ${i}
                        </button>
                    `;
                }
                
                // 如果总页数超过5页，添加省略号和最后一页
                if (totalPages > 5) {
                    pageButtons += `<button class="pagination-btn disabled">......</button>`;
                    pageButtons += `
                        <button class="pagination-btn ${totalPages === this.currentPageIndex ? 'active' : ''}" data-page="${totalPages}">
                            ${totalPages}
                        </button>
                    `;
                }
                
                paginationHTML += pageButtons;
                
                // 下一页按钮
                paginationHTML += `
                    <button class="pagination-btn ${this.currentPageIndex === totalPages ? 'disabled' : ''}" data-page="next">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                `;
                
                pagination.innerHTML = paginationHTML;
                
                // 绑定分页按钮事件
                pagination.querySelectorAll('.pagination-btn:not(.disabled)').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const page = btn.getAttribute('data-page');
                        
                        if (page === 'prev') {
                            if (this.currentPageIndex > 1) {
                                this.currentPageIndex--;
                                this.displayCustomers();
                                this.setupPagination();
                            }
                        } else if (page === 'next') {
                            const totalPages = Math.ceil(this.getFilteredCustomers().length / this.pageSize);
                            if (this.currentPageIndex < totalPages) {
                                this.currentPageIndex++;
                                this.displayCustomers();
                                this.setupPagination();
                            }
                        } else {
                            this.currentPageIndex = parseInt(page);
                            this.displayCustomers();
                            this.setupPagination();
                        }
                    });
                });
                
                // 绑定分页跳转按钮事件
                const jumpBtn = document.getElementById('page-jump-btn');
                const jumpInput = document.getElementById('page-jump-input');
                
                if (jumpBtn && jumpInput) {
                    const handleJump = () => {
                        const totalPages = Math.ceil(this.getFilteredCustomers().length / this.pageSize);
                        const targetPage = parseInt(jumpInput.value);
                        
                        if (targetPage >= 1 && targetPage <= totalPages) {
                            this.currentPageIndex = targetPage;
                            this.displayCustomers();
                            this.setupPagination();
                        }
                    };
                    
                    jumpBtn.addEventListener('click', handleJump);
                    jumpInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            handleJump();
                        }
                    });
                }
            },
            
            // 设置数据分发分页
            setupDistributionPagination: function() {
                // 简化版分页，固定每页100条
                // 实际项目中需要实现完整分页
            },
            
            // 更新分页信息
            updatePaginationInfo: function() {
                const infoElement = document.querySelector('.pagination-info');
                if (!infoElement) return;
                
                const filteredCustomers = this.getFilteredCustomers();
                
                infoElement.innerHTML = `
                    共 <strong>${filteredCustomers.length}</strong> 条
                `;
            },
            
            // 更新数据分发分页信息
            updateDistributionPaginationInfo: function(total) {
                const infoElement = document.querySelector('#data-distribution .pagination-info');
                if (!infoElement) return;
                
                infoElement.innerHTML = `
                    共 <strong>${total}</strong> 条数据，当前显示第 <strong>${this.currentPageIndex}</strong> 页
                `;
            },
            
            // 更新选中客户数量
            updateSelectedCount: function() {
                const selectedCount = document.querySelectorAll('.customer-checkbox:checked').length;
                const selectedCountElement = document.getElementById('selected-count');
                if (selectedCountElement) {
                    selectedCountElement.textContent = selectedCount;
                }
                
                // 启用或禁用分发按钮
                const distributeBtn = document.getElementById('distribute-btn');
                const targetEmployee = document.getElementById('target-employee');
                
                if (distributeBtn && targetEmployee) {
                    if (selectedCount > 0 && targetEmployee.value) {
                        distributeBtn.disabled = false;
                    } else {
                        distributeBtn.disabled = true;
                    }
                }
            },
            
            // 填充目标员工下拉框
            populateTargetEmployees: function() {
                const select = document.getElementById('target-employee');
                if (!select) return;
                
                // 清空现有选项（除了第一个）
                while (select.options.length > 1) {
                    select.remove(1);
                }
                
                // 根据当前用户角色确定可选择的员工
                let targetAccounts = [];
                
                if (this.currentUser.roleId === 1) {
                    // 超级管理员可以选择所有员工
                    targetAccounts = this.accounts.filter(a => a.roleId === 3 && a.id !== this.currentUser.id); // 只能选择组员，不包括自己
                } else if (this.currentUser.roleId === 2) {
                    // 组内管理员只能选择本组员工
                    targetAccounts = this.accounts.filter(a => a.roleId === 3 && a.department === this.currentUser.department && a.id !== this.currentUser.id);
                }
                
                // 添加选项
                targetAccounts.forEach(account => {
                    const option = document.createElement('option');
                    option.value = account.id;
                    option.textContent = account.name;
                    select.appendChild(option);
                });
                
                // 绑定选择事件
                select.addEventListener('change', () => {
                    this.updateSelectedCount();
                });
            },
            
            // 分发客户
            distributeCustomers: function() {
                const selectedCheckboxes = document.querySelectorAll('.customer-checkbox:checked');
                const targetEmployeeId = document.getElementById('target-employee').value;
                
                if (selectedCheckboxes.length === 0 || !targetEmployeeId) {
                    this.showAlert('操作提示', '请选择要分发的客户和目标员工');
                    return;
                }
                
                const targetEmployee = this.accounts.find(a => a.id === parseInt(targetEmployeeId));
                if (!targetEmployee) {
                    this.showAlert('操作提示', '目标员工不存在');
                    return;
                }
                
                const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.getAttribute('data-id')));
                
                // 显示确认弹窗
                this.showConfirm(
                    '确认分发',
                    `确定要将 ${selectedIds.length} 个客户分发给 ${targetEmployee.name} 吗？`,
                    () => {
                        // 执行分发操作
                        selectedIds.forEach(id => {
                            const customerIndex = this.customers.findIndex(c => c.id === id);
                            if (customerIndex !== -1) {
                                // 更新负责人
                                this.customers[customerIndex].owner = targetEmployee.name;
                                this.customers[customerIndex].department = targetEmployee.department;
                                
                                // 更新时间
                                this.customers[customerIndex].updateTime = this.formatDateTime(new Date());
                            }
                        });
                        
                        // 保存数据
                        this.saveCustomers();
                        
                        // 添加日志
                        this.addLog('数据分发', `分发了 ${selectedIds.length} 个客户给 ${targetEmployee.name}`);
                        
                        // 显示成功消息
                        this.showNotification(`成功分发了 ${selectedIds.length} 个客户给 ${targetEmployee.name}`, 'success');
                        
                        // 刷新显示
                        this.displayDistributionCustomers();
                        
                        // 重置选择
                        const selectAllCheckbox = document.getElementById('select-all-customers');
                        if (selectAllCheckbox) {
                            selectAllCheckbox.checked = false;
                        }
                        document.getElementById('target-employee').value = '';
                        this.updateSelectedCount();
                    }
                );
            },
            
            // 删除选中客户
            deleteSelectedCustomers: function() {
                const selectedCheckboxes = document.querySelectorAll('.customer-checkbox:checked');
                
                if (selectedCheckboxes.length === 0) {
                    this.showAlert('操作提示', '请选择要删除的客户');
                    return;
                }
                
                const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.getAttribute('data-id')));
                
                // 显示确认弹窗
                this.showConfirm(
                    '确认删除',
                    `确定要删除 ${selectedIds.length} 个客户吗？此操作不可恢复。`,
                    () => {
                        // 执行删除操作
                        this.customers = this.customers.filter(c => !selectedIds.includes(parseInt(c.id)));
                        
                        // 保存数据
                        this.saveCustomers();
                        
                        // 添加日志
                        this.addLog('客户删除', `删除了 ${selectedIds.length} 个客户`);
                        
                        // 显示成功消息
                        this.showNotification(`成功删除了 ${selectedIds.length} 个客户`, 'success');
                        
                        // 刷新显示
                        this.displayDistributionCustomers();
                        
                        // 重置选择
                        const selectAllCheckbox = document.getElementById('select-all-customers');
                        if (selectAllCheckbox) {
                            selectAllCheckbox.checked = false;
                        }
                        this.updateSelectedCount();
                    }
                );
            },
            
            // 显示分发日志
            showDistributionLogs: function() {
                // 筛选分发相关的日志
                const distributionLogs = this.logs.filter(log => log.action === '数据分发');
                
                let logsHTML = '';
                if (distributionLogs.length === 0) {
                    logsHTML = '<p style="text-align: center; color: #999; padding: 20px;">暂无分发记录</p>';
                } else {
                    logsHTML = `
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">分发时间</th>
                                    <th style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">操作人</th>
                                    <th style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">接收方</th>
                                    <th style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">转移数据量</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    
                    // 显示最近10条分发日志
                    const recentLogs = distributionLogs.slice(-10).reverse();
                    
                    recentLogs.forEach(log => {
                        // 从日志详情中提取信息
                        const match = log.details.match(/分发了 (\d+) 个客户给 (.+)/);
                        if (match) {
                            const count = match[1];
                            const recipient = match[2];
                            
                            logsHTML += `
                                <tr>
                                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${new Date(log.timestamp).toLocaleString()}</td>
                                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${log.userName}</td>
                                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${recipient}</td>
                                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${count} 条</td>
                                </tr>
                            `;
                        }
                    });
                    
                    logsHTML += '</tbody></table>';
                }
                
                this.showAlert('分发日志', logsHTML);
            },
            // 在现有的CRMApp对象中添加这些新方法：

// 显示导入客户模态框
showImportCustomerModal: function() {
    const modal = document.getElementById('import-customer-modal');
    if (!modal) {
        console.error('导入模态框不存在');
        return;
    }
    
    // 重置模态框
    this.resetImportModal();
    
    // 更新已选择字段显示
    const savedFields = localStorage.getItem('selectedFields');
    if (savedFields) {
        const fields = JSON.parse(savedFields);
        document.getElementById('selectedFieldsText').textContent = fields.join('、');
    } else {
        document.getElementById('selectedFieldsText').textContent = '手机';
    }
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 绑定事件（使用cloneNode移除旧事件）
    const closeBtn = document.getElementById('close-import-modal');
    const cancelBtn = document.getElementById('cancel-import-btn');
    const chooseFileBtn = document.getElementById('choose-file-btn');
    const fileInput = document.getElementById('file-input-hidden');
    const downloadBtn = document.getElementById('download-template-btn');
    const setFieldBtn = document.getElementById('setFieldBtn');
    const viewHistoryBtn = document.getElementById('view-import-history');
    const startImportBtn = document.getElementById('start-import-btn');
    
    // 使用cloneNode移除旧事件监听器
    const newCloseBtn = closeBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newChooseFileBtn = chooseFileBtn.cloneNode(true);
    const newDownloadBtn = downloadBtn.cloneNode(true);
    const newSetFieldBtn = setFieldBtn.cloneNode(true);
    const newViewHistoryBtn = viewHistoryBtn.cloneNode(true);
    const newStartImportBtn = startImportBtn.cloneNode(true);
    
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    chooseFileBtn.parentNode.replaceChild(newChooseFileBtn, chooseFileBtn);
    downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
    setFieldBtn.parentNode.replaceChild(newSetFieldBtn, setFieldBtn);
    viewHistoryBtn.parentNode.replaceChild(newViewHistoryBtn, viewHistoryBtn);
    startImportBtn.parentNode.replaceChild(newStartImportBtn, startImportBtn);
    
    // 绑定新事件
    newCloseBtn.addEventListener('click', () => {
        this.closeModal('import-customer-modal');
        this.resetImportModal();
    });
    
    newCancelBtn.addEventListener('click', () => {
        this.closeModal('import-customer-modal');
        this.resetImportModal();
    });
    
    newChooseFileBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        this.handleFileSelect(e);
    });
    
    newDownloadBtn.addEventListener('click', () => {
        this.downloadTemplate();
    });
    
    newSetFieldBtn.addEventListener('click', () => {
        this.showFieldSelectionModal();
    });
    
    newViewHistoryBtn.addEventListener('click', () => {
        this.showImportHistory();
    });
    
    newStartImportBtn.addEventListener('click', () => {
        this.startImport();
    });
},


// 处理文件选择
handleFileSelect: function(e) {
    const fileInput = e.target;
    const fileNameInput = document.getElementById('file-name-input');
    const fileInfo = document.getElementById('file-info');
    const importBtn = document.getElementById('start-import-btn');
    
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileNameInput.value = file.name;
        
        // 检查文件大小（限制2MB）
        if (file.size > 2 * 1024 * 1024) {
            fileInfo.innerHTML = '<span style="color: #f72585;">文件大小超过2MB限制</span>';
            importBtn.disabled = true;
            return;
        }
        
        // 检查文件类型
        const validTypes = ['.xlsx', '.xls', '.csv'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validTypes.includes(fileExtension)) {
            fileInfo.innerHTML = '<span style="color: #f72585;">请选择Excel(.xlsx, .xls)或CSV(.csv)文件</span>';
            importBtn.disabled = true;
            return;
        }
        
        fileInfo.innerHTML = `<span style="color: #4cc9f0;">文件大小: ${(file.size / 1024).toFixed(2)} KB</span>`;
        importBtn.disabled = false;
        
        // 激活第二步
        const step2 = document.querySelector('[data-step="2"]');
        if (step2) {
            step2.classList.add('active');
            step2.querySelector('.step-text').style.color = '#1890ff';
            step2.querySelector('.step-text').style.fontWeight = '600';
        }
        
        // 同时激活第一步（保持激活状态）
        const step1 = document.querySelector('[data-step="1"]');
        if (step1) {
            step1.classList.add('active');
        }
    }
},

// 显示字段选择模态框
showFieldSelectionModal: function() {
    const modal = document.getElementById('field-selection-modal');
    if (!modal) {
        console.error('字段选择模态框不存在');
        return;
    }
    
    // 重置字段选择
    const fieldItems = modal.querySelectorAll('.field-item');
    fieldItems.forEach(item => {
        item.classList.remove('active');
        item.style.backgroundColor = '';
        item.style.borderColor = '#d9d9d9';
        item.style.color = '#333';
    });
    
    // 加载保存的字段
    const savedFields = localStorage.getItem('selectedFields');
    if (savedFields) {
        const selectedFieldNames = JSON.parse(savedFields);
        fieldItems.forEach(item => {
            if (selectedFieldNames.includes(item.textContent)) {
                item.classList.add('active');
                item.style.backgroundColor = '#e6f7ff';
                item.style.borderColor = '#1890ff';
                item.style.color = '#1890ff';
            }
        });
    } else {
        // 默认选择手机字段
        fieldItems.forEach(item => {
            if (item.textContent === '手机') {
                item.classList.add('active');
                item.style.backgroundColor = '#e6f7ff';
                item.style.borderColor = '#1890ff';
                item.style.color = '#1890ff';
            }
        });
    }
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 绑定事件
    const closeBtn = document.getElementById('close-field-modal');
    const cancelBtn = document.getElementById('cancel-field-selection');
    const confirmBtn = document.getElementById('confirm-field-selection');
    
    const newCloseBtn = closeBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newConfirmBtn = confirmBtn.cloneNode(true);
    
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newCloseBtn.addEventListener('click', () => {
        this.closeModal('field-selection-modal');
    });
    
    newCancelBtn.addEventListener('click', () => {
        this.closeModal('field-selection-modal');
    });
    
    newConfirmBtn.addEventListener('click', () => {
        this.confirmFieldSelection();
    });
    
    // 绑定字段点击事件
    fieldItems.forEach(item => {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        newItem.addEventListener('click', () => {
            newItem.classList.toggle('active');
            if (newItem.classList.contains('active')) {
                newItem.style.backgroundColor = '#e6f7ff';
                newItem.style.borderColor = '#1890ff';
                newItem.style.color = '#1890ff';
            } else {
                newItem.style.backgroundColor = '';
                newItem.style.borderColor = '#d9d9d9';
                newItem.style.color = '#333';
            }
        });
    });
},

// 确认字段选择
confirmFieldSelection: function() {
    const modal = document.getElementById('field-selection-modal');
    const selectedFields = modal.querySelectorAll('.field-item.active');
    const selectedFieldsText = document.getElementById('selectedFieldsText');
    
    if (selectedFields.length === 0) {
        selectedFieldsText.textContent = '';
        localStorage.removeItem('selectedFields');
    } else {
        const fieldNames = Array.from(selectedFields).map(item => item.textContent);
        selectedFieldsText.textContent = fieldNames.join('、');
        localStorage.setItem('selectedFields', JSON.stringify(fieldNames));
    }
    
    this.closeModal('field-selection-modal');
},

// 下载模板
downloadTemplate: function() {
    // 从页面获取已选择的唯一字段
    const selectedFieldsText = document.getElementById('selectedFieldsText');
    const uniqueFields = selectedFieldsText ? selectedFieldsText.textContent.split('、') : ['手机'];
    
    // 创建模板数据
    const templateData = [
        ['客户名称', '接通状态', '手机', '客户级别', '备注', '负责人', '所属部门'],
        ['张三', '空号', '13700137000', 'C类客户', '暂无需求', '王客服', '客服部']
    ];
    
    // 创建使用说明工作表数据
    const fieldInfo = [
        ['客户名称', '文本', '是*', '否', '限50字以内', '张三'],
        ['接通状态', '枚举', '是*', '否', '已接通/未接听/空号', '已接通'],
        ['手机', '文本', '是*', '否', '11位数字', '13800138000'],
        ['客户级别', '枚举', '否', '否', 'A类/B类/C类', 'A类客户'],
        ['备注', '文本', '否', '否', '限200字以内', '意向客户'],
        ['负责人', '文本', '是*', '否', '限20字以内', '张经理'],
        ['所属部门', '文本', '是*', '否', '限20字以内', '销售一部']
    ];
    
    // 动态更新唯一字段标记
    const updatedFieldInfo = fieldInfo.map(field => {
        const [fieldName, type, isRequired, , format, example] = field;
        const isUnique = uniqueFields.includes(fieldName) ? '是*' : '否';
        return [fieldName, type, isRequired, isUnique, format, example, ''];
    });
    
    const usageData = [
        ['CRM客户导入使用说明', '', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['字段说明', '类型', '是否必填', '是否唯一', '格式要求', '示例', ''],
        ...updatedFieldInfo,
        ['', '', '', '', '', '', ''],
        ['注意事项:', '', '', '', '', '', ''],
        ['1. 唯一字段用于查重，请确保填写正确', '', '', '', '', '', ''],
        ['2. 必填字段必须填写，否则导入失败', '', '', '', '', '', ''],
        ['3. 导入前请删除示例数据', '', '', '', '', '', '']
    ];
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 创建数据模板工作表
    const wsData = XLSX.utils.aoa_to_sheet(templateData);
    
    // 创建使用说明工作表
    const wsUsage = XLSX.utils.aoa_to_sheet(usageData);
    
    // 为唯一字段添加*号和样式
    const headers = templateData[0];
    headers.forEach((header, colIndex) => {
        if (uniqueFields.includes(header)) {
            // 修改表头文本
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
            wsData[cellAddress].v = `${header}*`;
            
            // 设置红色背景样式
            wsData[cellAddress].s = {
                fill: { patternType: 'solid', fgColor: { rgb: 'FFFF0000' } },
                font: { color: { rgb: 'FFFFFFFF' }, bold: true },
                alignment: { horizontal: 'center', vertical: 'center' }
            };
        }
    });
    
    // 自动调整列宽
    const colWidths = headers.map(header => ({ wch: Math.max(header.length * 1.2, 10) }));
    wsData['!cols'] = colWidths;
    
    // 合并使用说明表头
    wsUsage['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }
    ];
    
    // 设置使用说明表头样式
    const usageHeaderCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
    wsUsage[usageHeaderCell].s = {
        font: { bold: true, sz: 14, color: { rgb: 'FFFFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: 'FF4361EE' } },
        alignment: { horizontal: 'center', vertical: 'center' }
    };
    
    // 将工作表添加到工作簿
    XLSX.utils.book_append_sheet(wb, wsData, '数据模板');
    XLSX.utils.book_append_sheet(wb, wsUsage, '使用说明');
    
    // 导出XLSX文件
    XLSX.writeFile(wb, '客户导入模板.xlsx');
    
    this.showNotification('模板下载开始', 'success');
},

// 开始导入
startImport: function() {
    const fileInput = document.getElementById('file-input-hidden');
    const duplicateHandling = document.getElementById('duplicate-handling').value;
    
    if (fileInput.files.length === 0) {
        this.showNotification('请先选择文件', 'warning');
        return;
    }
    
    // 检查文件类型
    const file = fileInput.files[0];
    const validTypes = ['.xlsx', '.xls', '.csv'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(fileExtension)) {
        this.showNotification('请选择Excel(.xlsx, .xls)或CSV(.csv)文件', 'warning');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const data = e.target.result;
        this.processImportData(data, file.name, duplicateHandling);
    };
    
    reader.onerror = () => {
        this.showNotification('文件读取失败', 'error');
        // 重置模态框状态
        this.resetImportModal();
    };
    
    // 根据文件类型选择读取方式
    if (file.name.endsWith('.csv')) {
        reader.readAsText(file, 'UTF-8');
    } else {
        // Excel文件
        reader.readAsArrayBuffer(file);
    }
    
    // 关闭导入模态框
    this.closeModal('import-customer-modal');
    
    // 显示进度模态框
    this.showImportProgressModal();
},

// 处理导入数据
processImportData: async function(data, fileName, duplicateHandling) {
    const progressModal = document.getElementById('import-progress-modal');
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = document.getElementById('progress-percentage');
    const importStatus = document.getElementById('import-status');
    const importDetails = document.getElementById('import-details');
    const closeProgressBtn = document.getElementById('close-progress-btn');
    
    // 重置进度
    progressBar.style.width = '0%';
    progressPercentage.textContent = '0%';
    importStatus.textContent = '正在解析文件...';
    importDetails.textContent = '';
    closeProgressBtn.style.display = 'none';
    
    // 模拟处理过程
    let importedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    try {
        // 使用XLSX库解析文件数据
        let workbook;
        let jsonData;
        
        // 检查数据是ArrayBuffer还是字符串
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            // 二进制数据（Excel文件）
            workbook = XLSX.read(data, { type: 'array' });
        } else if (typeof data === 'string') {
            // 文本数据（CSV文件）
            workbook = XLSX.read(data, { type: 'string' });
        } else {
            throw new Error('不支持的文件格式');
        }
        
        // 获取第一个工作表（通常是数据模板）
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 将工作表转换为JSON（第一行作为表头）
        jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
            throw new Error('文件为空或只有标题行');
        }
        
        // 获取表头
        const headers = jsonData[0].map(header => {
            // 移除可能的*号和空格
            const cleaned = String(header).replace(/\*+/g, '').trim();
            return cleaned;
        });
        
        console.log('表头:', headers);
        
        // 验证必要的标题
        // 获取用户选择的唯一字段
        const selectedFields = JSON.parse(localStorage.getItem('selectedFields') || '["手机"]');
        
        // 检查唯一字段是否都在表头中
        const missingHeaders = selectedFields.filter(req => !headers.includes(req));
        
        if (missingHeaders.length > 0) {
            throw new Error(`缺少必要字段: ${missingHeaders.join(', ')}`);
        }
        
        const totalRows = jsonData.length - 1;
        
        // 处理每一行数据
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // 跳过空行
            if (!row || row.length === 0 || row.every(cell => !cell && cell !== 0)) {
                errorCount++;
                continue;
            }
            
            // 创建客户对象
            const customer = {};
            headers.forEach((header, index) => {
                if (header && row[index] !== undefined) {
                    customer[header] = String(row[index]).trim();
                }
            });
            
            // 验证唯一字段是否有数据
            const hasUniqueFieldData = selectedFields.some(field => customer[field] && customer[field].trim() !== '');
            
            if (!hasUniqueFieldData) {
                errorCount++;
                continue;
            }
            
            // 检查重复
            const existingCustomer = this.customers.find(c => {
                // 使用用户选择的字段进行查重
                return selectedFields.some(field => {
                    const customerField = this.mapChineseFieldToEnglish(field);
                    const importValue = customer[field];
                    const existingValue = c[customerField];
                    
                    // 如果字段是手机，需要精确匹配
                    if (field === '手机') {
                        return existingValue === importValue;
                    }
                    // 其他字段使用包含匹配
                    return existingValue && importValue && existingValue.includes(importValue);
                });
            });
            
            if (existingCustomer) {
                if (duplicateHandling === 'skip') {
                    skippedCount++;
                } else if (duplicateHandling === 'cover') {
                    // 覆盖原有数据
                    existingCustomer.name = customer['客户名称'] || '';
                    existingCustomer.callStatus = customer['接通状态'] || '';
                    existingCustomer.phone = customer['手机'] || '';
                    existingCustomer.customerLevel = customer['客户级别'] || '';
                    existingCustomer.notes = customer['备注'] || '';
                    existingCustomer.owner = customer['负责人'] || '';
                    existingCustomer.department = customer['所属部门'] || '';
                    existingCustomer.updateTime = this.formatDateTime(new Date());
                    updatedCount++;
                } else if (duplicateHandling === 'update') {
                    // 更新原有数据（包括空字段）
                    existingCustomer.name = customer['客户名称'] || '';
                    existingCustomer.callStatus = customer['接通状态'] || '';
                    existingCustomer.phone = customer['手机'] || '';
                    existingCustomer.customerLevel = customer['客户级别'] || '';
                    existingCustomer.notes = customer['备注'] || '';
                    existingCustomer.owner = customer['负责人'] || '';
                    existingCustomer.department = customer['所属部门'] || '';
                    existingCustomer.updateTime = this.formatDateTime(new Date());
                    updatedCount++;
                }
            } else {
                // 新增客户
                const newCustomer = {
                    id: this.customers.length > 0 ? Math.max(...this.customers.map(c => Number(c.id))) + 1 : 1,
                    name: customer['客户名称'] || '',
                    callStatus: customer['接通状态'] || '',
                    phone: customer['手机'] || '',
                    customerLevel: customer['客户级别'] || '',
                    notes: customer['备注'] || '',
                    owner: customer['负责人'] || '',
                    department: customer['所属部门'] || '',
                    updateTime: this.formatDateTime(new Date())
                };
                
                this.customers.push(newCustomer);
                importedCount++;
            }
            
            // 更新进度
            const progress = Math.round((i / totalRows) * 100);
            progressBar.style.width = `${progress}%`;
            progressPercentage.textContent = `${progress}%`;
            importStatus.textContent = `正在导入第 ${i} 条数据...`;
            
            // 小延迟以显示进度
            if (i % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        // 保存数据
        this.saveCustomers();
        
        // 更新完成状态
        setTimeout(() => {
            progressBar.style.width = '100%';
            progressPercentage.textContent = '100%';
            importStatus.innerHTML = `<span style="color: #4cc9f0;">导入完成！</span>`;
            importDetails.innerHTML = `
                成功导入: <span style="color: #4cc9f0;">${importedCount}</span> 条<br>
                更新数据: <span style="color: #ff9e00;">${updatedCount}</span> 条<br>
                跳过重复: <span style="color: #666;">${skippedCount}</span> 条<br>
                错误数据: <span style="color: #f72585;">${errorCount}</span> 条
            `;
            closeProgressBtn.style.display = 'block';
            
            // 激活第三步
            const step3 = document.querySelector('[data-step="3"]');
            if (step3) {
                step3.classList.add('active');
                step3.querySelector('.step-text').style.color = '#1890ff';
                step3.querySelector('.step-text').style.fontWeight = '600';
            }
            
            // 记录导入历史
            this.recordImportHistory(fileName, importedCount + updatedCount);
        }, 500);
        
    } catch (error) {
        console.error('导入失败:', error);
        importStatus.innerHTML = `<span style="color: #f72585;">导入失败: ${error.message}</span>`;
        importDetails.innerHTML = '请检查文件格式和内容，确保符合模板要求';
        closeProgressBtn.style.display = 'block';
        
        // 重置导入模态框状态
        setTimeout(() => {
            this.resetImportModal();
        }, 1000);
    }
},
mapChineseFieldToEnglish: function(chineseField) {
    const fieldMap = {
        '客户名称': 'name',
        '接通状态': 'callStatus',
        '手机': 'phone',
        '客户级别': 'customerLevel',
        '备注': 'notes',
        '负责人': 'owner',
        '所属部门': 'department'
    };
    return fieldMap[chineseField] || chineseField;
},

// 5. 添加重置导入模态框方法
resetImportModal: function() {
    // 重置文件输入
    const fileInput = document.getElementById('file-input-hidden');
    const fileNameInput = document.getElementById('file-name-input');
    const fileInfo = document.getElementById('file-info');
    const importBtn = document.getElementById('start-import-btn');
    
    if (fileInput) fileInput.value = '';
    if (fileNameInput) fileNameInput.value = '';
    if (fileInfo) fileInfo.innerHTML = '';
    if (importBtn) importBtn.disabled = true;
    
    // 重置步骤条
    document.querySelectorAll('.step-item').forEach(item => {
        item.classList.remove('active');
        const stepText = item.querySelector('.step-text');
        if (stepText) {
            stepText.style.color = '#666';
            stepText.style.fontWeight = 'normal';
        }
    });
    
    // 激活第一步
    const step1 = document.querySelector('[data-step="1"]');
    if (step1) {
        step1.classList.add('active');
        const stepText = step1.querySelector('.step-text');
        if (stepText) {
            stepText.style.color = '#1890ff';
            stepText.style.fontWeight = '600';
        }
    }
},
// 显示导入进度模态框
showImportProgressModal: function() {
    const modal = document.getElementById('import-progress-modal');
    if (!modal) {
        console.error('进度模态框不存在');
        return;
    }
    
    modal.style.display = 'flex';
    
    const closeBtn = document.getElementById('close-progress-modal');
    const doneBtn = document.getElementById('close-progress-btn');
    
    const newCloseBtn = closeBtn.cloneNode(true);
    const newDoneBtn = doneBtn.cloneNode(true);
    
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    doneBtn.parentNode.replaceChild(newDoneBtn, doneBtn);
    
    newCloseBtn.addEventListener('click', () => {
        this.closeModal('import-progress-modal');
        this.resetImportModal(); // 重置导入模态框
    });
    
    newDoneBtn.addEventListener('click', () => {
        this.closeModal('import-progress-modal');
        this.resetImportModal(); // 重置导入模态框
        
        // 刷新客户列表
        this.displayCustomers();
        this.setupPagination();
        
        // 显示导入结果通知
        this.showNotification('客户数据导入完成', 'success');
    });
},

// 显示导入历史
showImportHistory: function() {
    // 从本地存储获取导入历史
    const importHistory = JSON.parse(localStorage.getItem('crm_import_history') || '[]');
    
    let historyHTML = '';
    if (importHistory.length === 0) {
        historyHTML = '<p style="text-align: center; color: #999; padding: 20px;">暂无导入记录</p>';
    } else {
        historyHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">导入时间</th>
                        <th style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">文件名</th>
                        <th style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">导入数量</th>
                        <th style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">操作人</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        importHistory.slice(-10).reverse().forEach(record => {
            historyHTML += `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${new Date(record.timestamp).toLocaleString()}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${record.fileName}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${record.importedCount} 条</td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${record.operator}</td>
                </tr>
            `;
        });
        
        historyHTML += '</tbody></table>';
    }
    
    this.showAlert('导入历史', historyHTML);
},

// 记录导入历史
recordImportHistory: function(fileName, importedCount) {
    const importHistory = JSON.parse(localStorage.getItem('crm_import_history') || '[]');
    
    importHistory.push({
        timestamp: new Date().toISOString(),
        fileName: fileName,
        importedCount: importedCount,
        operator: this.currentUser.name
    });
    
    // 只保留最近50条记录
    if (importHistory.length > 50) {
        importHistory.shift();
    }
    
    localStorage.setItem('crm_import_history', JSON.stringify(importHistory));
},
            // 显示编辑客户模态框
            showEditCustomerModal: function(customer) {
                const modal = document.getElementById('edit-customer-modal');
                const modalBody = document.getElementById('edit-customer-body');
                const modalFooter = document.getElementById('edit-customer-footer');
                const modalTitle = document.getElementById('edit-customer-title');
                
                const isEdit = !!customer;
                modalTitle.textContent = isEdit ? '编辑客户信息' : '新增客户';
                
                // 设置模态框内容
                modalBody.innerHTML = this.getEditCustomerModalHTML(customer);
                
                // 设置模态框按钮
                modalFooter.innerHTML = `
                    <button class="btn-cancel" id="cancel-edit-customer-btn">取消</button>
                    <button class="btn-confirm" id="save-customer-btn">
                        ${isEdit ? '更新客户' : '创建客户'}
                    </button>
                `;
                
                // 显示模态框
                modal.style.display = 'flex';
                
                // 为下拉菜单添加事件监听器
                const callStatusSelect = document.getElementById('edit-call-status');
                const customerLevelSelect = document.getElementById('edit-customer-level');
                
                const toggleClearButton = (select) => {
                    const clearButton = select.nextElementSibling;
                    if (select.value !== '') {
                        clearButton.style.display = 'block';
                    } else {
                        clearButton.style.display = 'none';
                    }
                };
                
                callStatusSelect.addEventListener('change', () => toggleClearButton(callStatusSelect));
                customerLevelSelect.addEventListener('change', () => toggleClearButton(customerLevelSelect));
                
                // 绑定事件
                document.getElementById('cancel-edit-customer-btn').addEventListener('click', () => {
                    this.closeModal('edit-customer-modal');
                });
                
                document.getElementById('save-customer-btn').addEventListener('click', () => {
                    this.saveCustomer(isEdit);
                });
                
                // 绑定导航按钮事件
                const self = this;
                
                // 获取当前用户可见的客户
                const visibleCustomers = this.getVisibleCustomers();
                
                // 获取客户在可见列表中的索引
                this.currentCustomerIndex = customer ? visibleCustomers.findIndex(c => c.id === customer.id) : -1;
                
                // 获取按钮元素
                const prevBtn = document.getElementById('prev-btn');
                const nextBtn = document.getElementById('next-btn');
                const autoNextBtn = document.getElementById('auto-next-btn');
                
                // 移除旧事件监听器
                prevBtn.replaceWith(prevBtn.cloneNode(true));
                nextBtn.replaceWith(nextBtn.cloneNode(true));
                autoNextBtn.replaceWith(autoNextBtn.cloneNode(true));
                
                // 更新按钮引用
                const newPrevBtn = document.getElementById('prev-btn');
                const newNextBtn = document.getElementById('next-btn');
                const newAutoNextBtn = document.getElementById('auto-next-btn');
                
                // 设置自动下一条按钮初始状态
                newAutoNextBtn.classList.toggle('active', this.isAutoNextEnabled);
                
                // 上一条按钮事件
                newPrevBtn.addEventListener('click', function() {
                    // 获取可见客户列表
                    const visibleCustomers = self.getVisibleCustomers();
                    
                    if (self.currentCustomerIndex === 0) {
                        // 创建页面内提示
                        const toast = document.createElement('div');
                        toast.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #ff6b6b; color: white; padding: 12px 20px; border-radius: 4px; z-index: 9999; font-size: 14px;';
                        toast.textContent = '当前已经是第一条数据，无法继续向上切换';
                        document.body.appendChild(toast);
                        // 3秒后移除提示
                        setTimeout(() => {
                            document.body.removeChild(toast);
                        }, 3000);
                        return;
                    }
                    
                    self.currentCustomerIndex--;
                    if (visibleCustomers[self.currentCustomerIndex]) {
                        self.showEditCustomerModal(visibleCustomers[self.currentCustomerIndex]);
                    }
                });
                
                // 下一条按钮事件
                newNextBtn.addEventListener('click', function() {
                    // 获取可见客户列表
                    const visibleCustomers = self.getVisibleCustomers();
                    
                    if (self.currentCustomerIndex === visibleCustomers.length - 1) {
                        // 创建页面内提示
                        const toast = document.createElement('div');
                        toast.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #ff6b6b; color: white; padding: 12px 20px; border-radius: 4px; z-index: 9999; font-size: 14px;';
                        toast.textContent = '当前已经是最后一条数据，无法继续向下切换';
                        document.body.appendChild(toast);
                        // 3秒后移除提示
                        setTimeout(() => {
                            document.body.removeChild(toast);
                        }, 3000);
                        return;
                    }
                    
                    self.currentCustomerIndex++;
                    if (visibleCustomers[self.currentCustomerIndex]) {
                        self.showEditCustomerModal(visibleCustomers[self.currentCustomerIndex]);
                    }
                });
                
                // 自动下一条按钮事件
                newAutoNextBtn.addEventListener('click', function(event) {
                    self.isAutoNextEnabled = !self.isAutoNextEnabled;
                    event.target.classList.toggle('active', self.isAutoNextEnabled);
                });
            },
            
            // 保存客户信息
            saveCustomer: function(isEdit) {
                const name = document.getElementById('edit-customer-name').value.trim();
                const phone = document.getElementById('edit-phone').value.trim();
                const callStatus = document.getElementById('edit-call-status').value;
                const customerLevel = document.getElementById('edit-customer-level').value;
                const notes = document.getElementById('edit-notes').value.trim();
                const owner = document.getElementById('edit-owner').value;
                const department = document.getElementById('edit-department').value;
                const id = parseInt(document.getElementById('edit-customer-id').value);
                
                // 验证
                if (!name) {
                    this.showNotification('客户名称不能为空', 'warning');
                    return;
                }
                
                if (!phone) {
                    this.showNotification('手机号码不能为空', 'warning');
                    return;
                }
                
                // 验证手机号码必须为数字且至少11位
                const phoneRegex = /^\d{11,}$/;
                if (!phoneRegex.test(phone)) {
                    this.showNotification('手机号码必须为数字且至少11位', 'warning');
                    return;
                }
                
                // 验证接通状态和客户级别是否有效
                const validCallStatuses = ['已接通', '未接通', '忙线', '无人接听'];
                const validCustomerLevels = ['A类客户', 'B类客户', 'C类客户', '黑名单'];
                let isValid = true;
                
                // 验证接通状态
                if (callStatus && !validCallStatuses.includes(callStatus)) {
                    this.showNotification('接通状态无效，请重新选择', 'warning');
                    document.getElementById('edit-call-status').value = '';
                    const statusDisplay = document.getElementById('status-display-index');
                    if (statusDisplay) {
                        statusDisplay.textContent = '请选择接通状态';
                    }
                    isValid = false;
                }
                
                // 验证客户级别
                if (customerLevel && !validCustomerLevels.includes(customerLevel)) {
                    this.showNotification('客户级别无效，请重新选择', 'warning');
                    document.getElementById('edit-customer-level').value = '';
                    const levelDisplay = document.getElementById('level-display-index');
                    if (levelDisplay) {
                        levelDisplay.textContent = '请选择客户级别';
                    }
                    isValid = false;
                }
                
                // 如果有任何验证失败，阻止提交
                if (!isValid) {
                    return;
                }
                
                const updateTime = this.formatDateTime(new Date());
                
                if (isEdit) {
                    // 更新现有客户
                    const customerIndex = this.customers.findIndex(c => c.id === id);
                    if (customerIndex !== -1) {
                        this.customers[customerIndex] = {
                            ...this.customers[customerIndex],
                            name,
                            phone,
                            callStatus,
                            customerLevel,
                            notes,
                            owner,
                            department,
                            updateTime
                        };
                        
                        this.saveCustomers();
                        this.addLog('编辑客户', `编辑了客户 ${name} 的信息`);
                        this.showNotification('客户信息已更新', 'success');
                    }
                } else {
                    // 新增客户
                    const newId = this.customers.length > 0 ? Math.max(...this.customers.map(c => c.id)) + 1 : 1;
                    
                    this.customers.push({
                        id: newId,
                        name,
                        phone,
                        callStatus,
                        customerLevel,
                        notes,
                        owner,
                        department,
                        updateTime
                    });
                    
                    this.saveCustomers();
                    this.addLog('新增客户', `新增了客户 ${name}`);
                    this.showNotification('客户已添加', 'success');
                }
                
                // 关闭模态框并刷新数据
                this.closeModal('edit-customer-modal');
                this.displayCustomers();
                this.updateRecentCustomers();
                this.setupPagination();
                
                // 如果自动下一条功能已开启，则自动跳转到下一条客户
                if (this.isAutoNextEnabled) {
                    const visibleCustomers = this.getVisibleCustomers();
                    this.currentCustomerIndex = (this.currentCustomerIndex + 1) % visibleCustomers.length;
                    if (visibleCustomers[this.currentCustomerIndex]) {
                        this.showEditCustomerModal(visibleCustomers[this.currentCustomerIndex]);
                    }
                }
            },
            
            // 显示场景设置模态框
            showScenarioSettingsModal: function() {
                const modal = document.getElementById('scenario-settings-modal');
                
                if (!modal) {
                    console.error('场景设置模态框不存在');
                    return;
                }
                
                // 显示模态框
                modal.style.display = 'flex';
                
                // 刷新场景列表
                this.refreshScenarioList();
                
                // 移除旧的事件监听器（如果存在）并绑定新的事件监听器
                const cancelBtn = document.getElementById('cancel-scenario-btn');
                const saveBtn = document.getElementById('save-scenarios-btn');
                
                if (cancelBtn && saveBtn) {
                    // 使用cloneNode方法移除所有事件监听器
                    const newCancelBtn = cancelBtn.cloneNode(true);
                    const newSaveBtn = saveBtn.cloneNode(true);
                    
                    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
                    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
                    
                    // 绑定新的事件监听器
                    newCancelBtn.addEventListener('click', () => {
                        this.closeModal('scenario-settings-modal');
                    });
                    
                    newSaveBtn.addEventListener('click', () => {
                        this.saveScenarios();
                    });
                }
                
                // 处理新建场景按钮
                const addBtn = document.getElementById('add-scenario-btn');
                if (addBtn) {
                    const newAddBtn = addBtn.cloneNode(true);
                    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
                    newAddBtn.addEventListener('click', () => {
                        this.showNewScenarioModal();
                    });
                }
                
                // 绑定场景控制按钮事件
                const hideSceneBtn = document.getElementById('hide-scene-btn');
                const showSceneBtn = document.getElementById('show-scene-btn');
                
                // 使用cloneNode方法移除所有事件监听器
                const newHideSceneBtn = hideSceneBtn.cloneNode(true);
                const newShowSceneBtn = showSceneBtn.cloneNode(true);
                
                hideSceneBtn.parentNode.replaceChild(newHideSceneBtn, hideSceneBtn);
                showSceneBtn.parentNode.replaceChild(newShowSceneBtn, showSceneBtn);
                
                // 绑定隐藏场景按钮事件
                newHideSceneBtn.addEventListener('click', () => {
                    const selectedItems = document.querySelectorAll('.scene-list .scenario-item.selected');
                    selectedItems.forEach(item => {
                        const scenarioName = item.getAttribute('data-scenario');
                        const scenario = this.scenarios.find(s => s.name === scenarioName);
                        if (scenario && scenario.visibility !== 'always') {
                            scenario.visibility = 'hidden';
                        }
                    });
                    this.refreshScenarioList();
                });
                
                // 绑定显示场景按钮事件
                newShowSceneBtn.addEventListener('click', () => {
                    const selectedItems = document.querySelectorAll('.scene-list .scenario-item.selected');
                    selectedItems.forEach(item => {
                        const scenarioName = item.getAttribute('data-scenario');
                        const scenario = this.scenarios.find(s => s.name === scenarioName);
                        if (scenario) {
                            scenario.visibility = 'visible';
                        }
                    });
                    this.refreshScenarioList();
                });
                
                // 初始化场景列表
                this.refreshScenarioList();
            },
            
            // 显示新建场景模态框
            showNewScenarioModal: function() {
             const modal = document.getElementById('new-scenario-modal');
             const container = document.getElementById('new-scenario-conditions-container');
    
    // 清空现有条件
    container.innerHTML = '';
    
    // 不添加初始条件行，让用户自行添加
    
    // 清空场景名称输入框
    document.getElementById('new-scenario-name').value = '';
    
    // 重置默认场景复选框
    document.getElementById('set-default').checked = false;
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 绑定事件 - 使用cloneNode移除旧事件
    const closeBtn = document.getElementById('close-new-scenario-modal');
    const cancelBtn = document.getElementById('cancel-new-scenario-btn');
    const createBtn = document.getElementById('create-scenario-btn');
    const addConditionBtn = document.getElementById('add-new-condition-btn');
    
    const newCloseBtn = closeBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newCreateBtn = createBtn.cloneNode(true);
    const newAddConditionBtn = addConditionBtn.cloneNode(true);
    
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    createBtn.parentNode.replaceChild(newCreateBtn, createBtn);
    addConditionBtn.parentNode.replaceChild(newAddConditionBtn, addConditionBtn);
    
    // 绑定新事件
    newCloseBtn.addEventListener('click', () => {
        this.closeModal('new-scenario-modal');
    });
    
    newCancelBtn.addEventListener('click', () => {
        this.closeModal('new-scenario-modal');
    });
    
    newCreateBtn.addEventListener('click', () => {
        this.createScenario();
    });
    
    newAddConditionBtn.addEventListener('click', () => {
        const container = document.getElementById('new-scenario-conditions-container');
        const index = container.children.length;
        this.addNewConditionRow(index);
    });
},

            // 添加新条件行
addNewConditionRow: function(index) {
    const container = document.getElementById('new-scenario-conditions-container');
    
    // 创建条件行
    const row = document.createElement('div');
    row.className = 'filter-row';
    row.setAttribute('data-index', index);
    
    // 字段选项
    const fieldOptions = `
        <option value="customerLevel">客户级别</option>
        <option value="callStatus">接通状态</option>
        <option value="phoneNumber">手机号</option>
        <option value="department">所属部门</option>
        <option value="owner">负责人</option>
    `;
    
    // 操作符选项
    const operatorOptions = `
        <option value="=">等于</option>
        <option value="!=">不等于</option>
        <option value="contains">包含</option>
        <option value="not_contains">不包含</option>
        <option value="is_empty">为空</option>
        <option value="not_empty">不为空</option>
    `;
    
    row.innerHTML = `
        <select class="field-select" data-index="${index}">
            <option value="customerLevel" selected>客户级别</option>
            <option value="callStatus">接通状态</option>
            <option value="phoneNumber">手机号</option>
            <option value="department">所属部门</option>
            <option value="owner">负责人</option>
        </select>
        <select class="operator-select" data-index="${index}">
            <option value="=" selected>等于</option>
            <option value="!=">不等于</option>
            <option value="contains">包含</option>
            <option value="not_contains">不包含</option>
            <option value="is_empty">为空</option>
            <option value="not_empty">不为空</option>
        </select>
        <div class="value-container" data-index="${index}">
            <input type="text" class="value-input" data-index="${index}" placeholder="多个条件请用；隔开">
        </div>
        <button class="del-btn" data-index="${index}">&times;</button>
    `;
    
    container.appendChild(row);
    
    // 绑定字段选择事件
    const fieldSelect = row.querySelector('.field-select');
    const operatorSelect = row.querySelector('.operator-select');
    const valueContainer = row.querySelector('.value-container');
    
    // 初始化值输入框
    this.updateValueInput(fieldSelect.value, operatorSelect.value, valueContainer, index);
    
    // 绑定字段选择变化事件
    fieldSelect.addEventListener('change', (e) => {
        const field = e.target.value;
        const operator = row.querySelector('.operator-select').value;
        this.updateValueInput(field, operator, valueContainer, index);
    });
    
    // 绑定操作符选择变化事件
    operatorSelect.addEventListener('change', (e) => {
        const field = row.querySelector('.field-select').value;
        const operator = e.target.value;
        this.updateValueInput(field, operator, valueContainer, index);
    });
    
    // 绑定删除按钮事件
    const deleteBtn = row.querySelector('.del-btn');
    deleteBtn.addEventListener('click', () => {
        // 至少保留一个条件
        if (container.children.length > 0) {
            row.remove();
            
            // 更新剩余行的索引
            const rows = container.querySelectorAll('.filter-row');
            rows.forEach((row, newIndex) => {
                row.setAttribute('data-index', newIndex);
                const inputs = row.querySelectorAll('[data-index]');
                inputs.forEach(input => {
                    input.setAttribute('data-index', newIndex);
                });
            });
        } else {
            this.showNotification('至少需要保留一个条件', 'warning');
        }
    });
},
// 添加编辑场景条件行
addEditConditionRow: function(condition, index) {
    const container = document.getElementById('edit-scenario-conditions-container');
    
    // 字段选项
    const fieldOptions = `
        <option value="customerLevel" ${condition.field === 'customerLevel' ? 'selected' : ''}>客户级别</option>
        <option value="callStatus" ${condition.field === 'callStatus' ? 'selected' : ''}>接通状态</option>
        <option value="phoneNumber" ${condition.field === 'phoneNumber' ? 'selected' : ''}>手机号</option>
        <option value="department" ${condition.field === 'department' ? 'selected' : ''}>所属部门</option>
        <option value="owner" ${condition.field === 'owner' ? 'selected' : ''}>负责人</option>
    `;
    
    // 操作符选项
    const operatorOptions = `
        <option value="=" ${condition.operator === '=' ? 'selected' : ''}>等于</option>
        <option value="!=" ${condition.operator === '!=' ? 'selected' : ''}>不等于</option>
        <option value="contains" ${condition.operator === 'contains' ? 'selected' : ''}>包含</option>
        <option value="not_contains" ${condition.operator === 'not_contains' ? 'selected' : ''}>不包含</option>
        <option value="is_empty" ${condition.operator === 'is_empty' ? 'selected' : ''}>为空</option>
        <option value="not_empty" ${condition.operator === 'not_empty' ? 'selected' : ''}>不为空</option>
    `;
    
    // 创建条件行
    const row = document.createElement('div');
    row.className = 'filter-row';
    row.setAttribute('data-index', index);
    
    row.innerHTML = `
        <select class="field-select" data-index="${index}">
            ${fieldOptions}
        </select>
        <select class="operator-select" data-index="${index}">
            ${operatorOptions}
        </select>
        <div class="value-container" data-index="${index}">
            <!-- 值输入框将根据字段和操作符动态生成 -->
        </div>
        <button class="del-btn" data-index="${index}">&times;</button>
    `;
    
    container.appendChild(row);
    
    // 根据条件初始化值输入框
    const fieldSelect = row.querySelector('.field-select');
    const operatorSelect = row.querySelector('.operator-select');
    const valueContainer = row.querySelector('.value-container');
    
    // 初始化值输入框
    this.updateEditValueInput(condition.field, condition.operator, condition.value, valueContainer, index);
    
    // 绑定字段选择变化事件
    fieldSelect.addEventListener('change', (e) => {
        const field = e.target.value;
        const operator = row.querySelector('.operator-select').value;
        this.updateEditValueInput(field, operator, '', valueContainer, index);
    });
    
    // 绑定操作符选择变化事件
    operatorSelect.addEventListener('change', (e) => {
        const field = row.querySelector('.field-select').value;
        const operator = e.target.value;
        this.updateEditValueInput(field, operator, '', valueContainer, index);
    });
    
    // 绑定删除按钮事件
    const deleteBtn = row.querySelector('.del-btn');
    deleteBtn.addEventListener('click', () => {
        row.remove();
        
        // 更新剩余行的索引
        const rows = container.querySelectorAll('.filter-row');
        
        // 如果删除后没有条件了，显示提示
        if (rows.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-conditions';
           // emptyMessage.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无筛选条件</p>';
            container.appendChild(emptyMessage);
        } else {
            // 更新索引
            rows.forEach((row, newIndex) => {
                row.setAttribute('data-index', newIndex);
                const inputs = row.querySelectorAll('[data-index]');
                inputs.forEach(input => {
                    input.setAttribute('data-index', newIndex);
                });
            });
        }
    });
},
// 更新编辑场景的值输入框
updateEditValueInput: function(field, operator, currentValue, valueContainer, index) {
    // 清空值容器
    valueContainer.innerHTML = '';
    
    // 如果操作符是"为空"或"不为空"，则不显示值输入框
    if (operator === 'is_empty' || operator === 'not_empty') {
        // 创建隐藏的输入框来保存值（空字符串）
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.className = 'value-input';
        hiddenInput.setAttribute('data-index', index);
        hiddenInput.value = '';
        valueContainer.appendChild(hiddenInput);
        return;
    }
    
    // 根据字段类型创建不同的值输入框
    switch(field) {
        case 'customerLevel':
            // 客户级别 - 下拉选择框
            const customerLevels = ['A类客户', 'B类客户', 'C类客户', '黑名单'];
            const levelSelect = document.createElement('select');
            levelSelect.className = 'value-select';
            levelSelect.setAttribute('data-index', index);
            
            customerLevels.forEach(level => {
                const option = document.createElement('option');
                option.value = level;
                option.textContent = level;
                if (level === currentValue) {
                    option.selected = true;
                }
                levelSelect.appendChild(option);
            });
            
            valueContainer.appendChild(levelSelect);
            break;
            
        case 'callStatus':
            // 接通状态 - 下拉选择框
            const callStatuses = ['已接通', '未接听', '空号', '关机', '拒接'];
            const statusSelect = document.createElement('select');
            statusSelect.className = 'value-select';
            statusSelect.setAttribute('data-index', index);
            
            callStatuses.forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                if (status === currentValue) {
                    option.selected = true;
                }
                statusSelect.appendChild(option);
            });
            
            valueContainer.appendChild(statusSelect);
            break;
            
        case 'department':
            // 所属部门 - 下拉选择框，从现有客户数据中提取部门
            const departments = this.getUniqueDepartments();
            const deptSelect = document.createElement('select');
            deptSelect.className = 'value-select';
            deptSelect.setAttribute('data-index', index);
            
            departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                if (dept === currentValue) {
                    option.selected = true;
                }
                deptSelect.appendChild(option);
            });
            
            valueContainer.appendChild(deptSelect);
            break;
            
        case 'owner':
            // 负责人 - 下拉选择框，从现有账户数据中提取
            const owners = this.getUniqueOwners();
            const ownerSelect = document.createElement('select');
            ownerSelect.className = 'value-select';
            ownerSelect.setAttribute('data-index', index);
            
            owners.forEach(owner => {
                const option = document.createElement('option');
                option.value = owner;
                option.textContent = owner;
                if (owner === currentValue) {
                    option.selected = true;
                }
                ownerSelect.appendChild(option);
            });
            
            valueContainer.appendChild(ownerSelect);
            break;
            
        default:
            // 其他字段（手机号） - 文本输入框
            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'value-input';
            textInput.setAttribute('data-index', index);
            textInput.placeholder = '多个条件请用；隔开';
            textInput.value = currentValue || '';
            valueContainer.appendChild(textInput);
            break;
    }
},
            // 更新值输入框（根据字段和操作符动态生成）
updateValueInput: function(field, operator, valueContainer, index) {
    // 原函数实现...
},

// 更新高级筛选的值输入框
updateAdvancedValueInput: function(field, operator, valueContainer, index) {
    // 清空值容器
    valueContainer.innerHTML = '';
    
    // 如果操作符是"为空"或"不为空"，则不显示值输入框
    if (operator === 'is_empty' || operator === 'not_empty') {
        // 创建隐藏的输入框来保存值（空字符串）
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.className = 'value-input';
        hiddenInput.setAttribute('data-index', index);
        hiddenInput.value = '';
        valueContainer.appendChild(hiddenInput);
        return;
    }
    
    // 根据字段类型创建不同的值输入框
    switch(field) {
        case 'customerLevel':
            // 客户级别 - 下拉选择框
            const customerLevels = [ 'A类客户', 'B类客户', 'C类客户', '黑名单'];
            const levelSelect = document.createElement('select');
            levelSelect.className = 'value-select';
            levelSelect.setAttribute('data-index', index);
            
            customerLevels.forEach(level => {
                const option = document.createElement('option');
                option.value = level;
                option.textContent = level;
                levelSelect.appendChild(option);
            });
            
            valueContainer.appendChild(levelSelect);
            break;
            
        case 'callStatus':
            // 接通状态 - 下拉选择框
            const callStatuses = ['已接通', '未接听', '空号', '关机', '拒接'];
            const statusSelect = document.createElement('select');
            statusSelect.className = 'value-select';
            statusSelect.setAttribute('data-index', index);
            
            callStatuses.forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                statusSelect.appendChild(option);
            });
            
            valueContainer.appendChild(statusSelect);
            break;
            
        case 'department':
            // 所属部门 - 下拉选择框，从现有客户数据中提取部门
            const departments = this.getUniqueDepartments();
            const deptSelect = document.createElement('select');
            deptSelect.className = 'value-select';
            deptSelect.setAttribute('data-index', index);
            
            departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                deptSelect.appendChild(option);
            });
            
            valueContainer.appendChild(deptSelect);
            break;
            
        case 'responsiblePerson':
            // 负责人 - 下拉选择框，从现有账户数据中提取
            const owners = this.getUniqueOwners();
            const ownerSelect = document.createElement('select');
            ownerSelect.className = 'value-select';
            ownerSelect.setAttribute('data-index', index);
            
            owners.forEach(owner => {
                const option = document.createElement('option');
                option.value = owner;
                option.textContent = owner;
                ownerSelect.appendChild(option);
            });
            
            valueContainer.appendChild(ownerSelect);
            break;
            
        default:
            // 其他字段 - 文本输入框
            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'value-input';
            textInput.setAttribute('data-index', index);
            textInput.placeholder = '请输入值';
            valueContainer.appendChild(textInput);
            break;
    }
},

// 原updateValueInput函数继续...
updateValueInput: function(field, operator, valueContainer, index) {
    const container = document.getElementById('new-scenario-conditions-container');
    
    // 清空值容器
    valueContainer.innerHTML = '';
    
    // 如果操作符是"为空"或"不为空"，则不显示值输入框
    if (operator === 'is_empty' || operator === 'not_empty') {
        // 创建隐藏的输入框来保存值（空字符串）
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.className = 'value-input';
        hiddenInput.setAttribute('data-index', index);
        hiddenInput.value = '';
        valueContainer.appendChild(hiddenInput);
        return;
    }
    
    // 根据字段类型创建不同的值输入框
    switch(field) {
        case 'customerLevel':
            // 客户级别 - 下拉选择框
            const customerLevels = [ 'A类客户', 'B类客户', 'C类客户', '黑名单'];
            const levelSelect = document.createElement('select');
            levelSelect.className = 'value-select';
            levelSelect.setAttribute('data-index', index);
            
            customerLevels.forEach(level => {
                const option = document.createElement('option');
                option.value = level;
                option.textContent = level;
                levelSelect.appendChild(option);
            });
            
            valueContainer.appendChild(levelSelect);
            break;
            
        case 'callStatus':
            // 接通状态 - 下拉选择框
            const callStatuses = ['已接通', '未接听', '空号', '关机', '拒接'];
            const statusSelect = document.createElement('select');
            statusSelect.className = 'value-select';
            statusSelect.setAttribute('data-index', index);
            
            callStatuses.forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                statusSelect.appendChild(option);
            });
            
            valueContainer.appendChild(statusSelect);
            break;
            
        case 'department':
            // 所属部门 - 下拉选择框，从现有客户数据中提取部门
            const departments = this.getUniqueDepartments();
            const deptSelect = document.createElement('select');
            deptSelect.className = 'value-select';
            deptSelect.setAttribute('data-index', index);
            
            departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                deptSelect.appendChild(option);
            });
            
            valueContainer.appendChild(deptSelect);
            break;
            
        case 'owner':
            // 负责人 - 下拉选择框，从现有账户数据中提取
            const owners = this.getUniqueOwners();
            const ownerSelect = document.createElement('select');
            ownerSelect.className = 'value-select';
            ownerSelect.setAttribute('data-index', index);
            
            owners.forEach(owner => {
                const option = document.createElement('option');
                option.value = owner;
                option.textContent = owner;
                ownerSelect.appendChild(option);
            });
            
            valueContainer.appendChild(ownerSelect);
            break;
            
        default:
            // 其他字段（手机号） - 文本输入框
            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'value-input';
            textInput.setAttribute('data-index', index);
            textInput.placeholder = '多个条件请用；隔开';
            valueContainer.appendChild(textInput);
            break;
    }
},
// 获取唯一的部门列表（从字段选项中获取）
getUniqueDepartments: function() {
    // 先尝试从已加载的字段选项中获取
    if (this.fieldOptions && this.fieldOptions.department) {
        return this.fieldOptions.department.map(option => option.name);
    }
    
    // 如果字段选项未加载，则使用默认部门
    return ['销售一部', '销售二部'];
},

// 获取唯一的负责人列表
getUniqueOwners: function() {
    const owners = new Set();
    this.customers.forEach(customer => {
        if (customer.owner) {
            owners.add(customer.owner);
        }
    });
    
    // 同时从账户数据中获取
    this.accounts.forEach(account => {
        if (account.name) {
            owners.add(account.name);
        }
    });
    
    return Array.from(owners);
},
            // 从条件行获取当前条件
           getCurrentConditionFromRow: function(row) {
    const fieldSelect = row.querySelector('.field-select');
    const operatorSelect = row.querySelector('.operator-select');
    
    // 获取值输入框（可能是select或input或隐藏的input）
    const valueContainer = row.querySelector('.value-container');
    let value = '';
    
    if (valueContainer) {
        const valueSelect = valueContainer.querySelector('.value-select');
        const valueInput = valueContainer.querySelector('.value-input');
        
        if (valueSelect) {
            value = valueSelect.value;
        } else if (valueInput) {
            value = valueInput.value.trim();
        }
    }
    
    return {
        field: fieldSelect ? fieldSelect.value : '',
        operator: operatorSelect ? operatorSelect.value : '=',
        value: value
    };
},
            
            // 创建场景
            createScenario: function() {
    const scenarioNameInput = document.getElementById('new-scenario-name');
    if (!scenarioNameInput) {
        this.showNotification('无法找到场景名称输入框', 'error');
        return;
    }
    
    const scenarioName = scenarioNameInput.value.trim();
    
    if (!scenarioName) {
        this.showNotification('请输入场景名称', 'warning');
        return;
    }
    
    if (this.scenarios.some(s => s.name === scenarioName)) {
        this.showNotification('该场景已存在', 'warning');
        return;
    }
    
    // 获取所有条件
    const container = document.getElementById('new-scenario-conditions-container');
    const rows = container.querySelectorAll('.filter-row');
    const conditions = [];
    
    rows.forEach(row => {
        const fieldSelect = row.querySelector('.field-select');
        const operatorSelect = row.querySelector('.operator-select');
        const valueInput = row.querySelector('.value-input');
        
        // 检查元素是否存在
        if (fieldSelect && operatorSelect && valueInput) {
            const field = fieldSelect.value;
            const operator = operatorSelect.value;
            const value = valueInput.value.trim();
            
            if (field && operator && value) {
                conditions.push({ 
                    field: field, 
                    operator: operator,
                    value: value 
                });
            }
        }
    });
    
    // 允许筛选条件为0
    // if (conditions.length === 0) {
    //     this.showNotification('请至少添加一个有效的筛选条件', 'warning');
    //     return;
    // }
    
    // 是否设为默认
    const isDefaultCheckbox = document.getElementById('set-default');
    const isDefault = isDefaultCheckbox ? isDefaultCheckbox.checked : false;
    
    // 创建新场景
    const newScenario = { 
        name: scenarioName, 
        conditions: conditions, 
        visibility: 'visible',
        isDefault: isDefault
    };
    
    // 添加到场景列表
    this.scenarios.push(newScenario);
    
    // 如果设为默认，更新默认场景
    if (isDefault) {
        localStorage.setItem('crm_default_scenario', scenarioName);
        // 更新当前默认场景标记
        this.currentFilter = scenarioName;
    }
    
    // 保存场景数据（不关闭场景设置面板）
    this.saveScenarios(false);
    
    // 刷新场景列表
    this.refreshScenarioList();
    
    // 关闭模态框
    this.closeModal('new-scenario-modal');
    
    this.showNotification('场景已创建', 'success');
    this.addLog('场景设置', `创建了场景 ${scenarioName}`);
},
            
            // 兼容原有添加场景函数
            addScenario: function() {
                // 兼容原有调用，实际调用新的模态框
                this.showNewScenarioModal();
            },
            
            // 删除场景
            deleteScenario: function(scenarioName) {
                // 不能删除当前默认场景
                const defaultScenario = localStorage.getItem('crm_default_scenario');
                if (scenarioName === defaultScenario) {
                    this.showNotification('不能删除当前默认场景', 'warning');
                    return;
                }
                
                this.showConfirm(
                    '确认删除',
                    `确定要删除场景"${scenarioName}"吗？`,
                    () => {
                        // 从场景列表中移除
                        this.scenarios = this.scenarios.filter(s => s.name !== scenarioName);
                        
                        // 保存场景数据（不关闭场景设置面板）
                        this.saveScenarios(false);
                        
                        // 刷新场景列表显示
                        this.refreshScenarioList();
                        
                        // 如果当前筛选条件是被删除的场景，则重置为"全部"
                        if (this.currentFilter === scenarioName) {
                            this.currentFilter = '全部';
                        }
                        
                        // 检查是否所有场景都被删除
                        if (this.scenarios.length === 0) {
                            // 自动生成"全部"场景
                            this.scenarios = [{ name: '全部', conditions: [] }];
                            this.saveScenarios();
                            this.refreshScenarioList();
                            this.showNotification('已自动生成"全部"场景', 'success');
                        } else {
                            this.showNotification('场景已删除', 'success');
                            this.addLog('场景设置', `删除了场景 ${scenarioName}`);
                        }
                    }
                );
            },
            
            // 保存场景
            saveScenarios: function(closeModal = true) {
                localStorage.setItem('crm_scenarios', JSON.stringify(this.scenarios));
                
                // 更新筛选按钮
                this.displayFilterButtons();
                
                // 刷新客户列表和分页
                this.displayCustomers();
                this.setupPagination();
                
                this.showNotification('场景设置已保存', 'success');
                if (closeModal) {
                    this.closeModal('scenario-settings-modal');
                }
            },
            
            // 刷新场景列表显示
            refreshScenarioList: function() {
                const displayedScenes = document.getElementById('displayed-scenes');
                const hiddenScenes = document.getElementById('hidden-scenes');
                
                if (!displayedScenes || !hiddenScenes) return;
                
                // 确保场景数据包含visibility属性
                this.scenarios.forEach(scenario => {
                    if (scenario.name === '场景设置') {
                        scenario.visibility = 'always';
                    } else if (scenario.visibility === undefined) {
                        scenario.visibility = 'visible';
                    }
                });
                
                // 分离显示和隐藏的场景
                const visibleScenarios = this.scenarios.filter(s => s.visibility === 'visible' || s.visibility === 'always');
                const hiddenScenarios = this.scenarios.filter(s => s.visibility === 'hidden');
                
                // 更新计数文本
                const displayedCountText = displayedScenes.parentNode.querySelector('.count-text');
                const hiddenCountText = hiddenScenes.parentNode.querySelector('.count-text');
                
                // 计算已选中的场景数量
                const displayedSelectedCount = displayedScenes.querySelectorAll('.item-checkbox:checked').length;
                const hiddenSelectedCount = hiddenScenes.querySelectorAll('.item-checkbox:checked').length;
                
                displayedCountText.textContent = `${displayedSelectedCount}/${visibleScenarios.length}`;
                hiddenCountText.textContent = `${hiddenSelectedCount}/${hiddenScenarios.length}`;
                
                // 加载默认场景设置
                const defaultScenario = localStorage.getItem('crm_default_scenario');
                
                // 生成显示的场景列表
                displayedScenes.innerHTML = visibleScenarios.map((scenario, index) => {
                    const scenarioName = scenario.name;
                    if (scenarioName === '场景设置') return '';
                    const isDefault = scenarioName === defaultScenario;
                    return `
                        <div class="scenario-item ${isDefault ? 'default-scene' : ''}" data-scenario="${scenarioName}">
                            <input type="checkbox" class="item-checkbox">
                            <div class="scenario-name">${scenarioName}</div>
                            <div class="scenario-actions">
                                <button class="scene-action-btn edit" title="编辑场景">✎</button>
                                <button class="scene-action-btn delete" title="删除场景">✕</button>
                                <button class="scene-action-btn default" title="设为默认场景">★</button>
                            </div>
                        </div>
                    `;
                }).join('');
                
                // 生成隐藏的场景列表
                hiddenScenes.innerHTML = hiddenScenarios.map((scenario) => {
                    const scenarioName = scenario.name;
                    if (scenarioName === '场景设置') return '';
                    const isDefault = scenarioName === defaultScenario;
                    return `
                        <div class="scenario-item ${isDefault ? 'default-scene' : ''}" data-scenario="${scenarioName}">
                            <input type="checkbox" class="item-checkbox">
                            <div class="scenario-name">${scenarioName}</div>
                            <div class="scenario-actions">
                                <button class="scene-action-btn edit" title="编辑场景">✎</button>
                                <button class="scene-action-btn delete" title="删除场景">✕</button>
                                <button class="scene-action-btn default" title="设为默认场景">★</button>
                            </div>
                        </div>
                    `;
                }).join('');
                
                // 绑定操作按钮事件
                document.querySelectorAll('.scene-action-btn.edit').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const scenarioItem = e.target.closest('.scenario-item');
                        const scenarioName = scenarioItem.getAttribute('data-scenario');
                        CRMApp.showScenarioConditionsModal(scenarioName);
                    });
                });
                
                document.querySelectorAll('.scene-action-btn.delete').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const scenarioItem = e.target.closest('.scenario-item');
                        const scenarioName = scenarioItem.getAttribute('data-scenario');
                        {
                            CRMApp.deleteScenario(scenarioName);
                        }
                    });
                });
                
                document.querySelectorAll('.scene-action-btn.default').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const scenarioItem = e.target.closest('.scenario-item');
                        const scenarioName = scenarioItem.getAttribute('data-scenario');

                        // 移除所有场景的默认样式
                        document.querySelectorAll('.scenario-item').forEach(item => {
                            item.classList.remove('default-scene');
                        });
                        
                        // 设置当前场景为默认
                        scenarioItem.classList.add('default-scene');
                        localStorage.setItem('crm_default_scenario', scenarioName);
                        // 更新当前过滤器
                        CRMApp.currentFilter = scenarioName;
                        // 更新过滤按钮样式
                        CRMApp.displayFilterButtons();
                        CRMApp.showNotification(`已将「${scenarioName}」设为默认场景`, 'success');
                    });
                });
                
                // 绑定复选框事件
                document.querySelectorAll('.item-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', function(e) {
                        e.stopPropagation(); // 阻止事件冒泡到场景项
                        const parentList = e.target.closest('.scene-panel').querySelector('.scene-list').id;
                        CRMApp.updateCount(parentList);
                        CRMApp.syncAllCheckbox(parentList);
                    });
                });
                
                // 绑定全选复选框事件
                document.querySelectorAll('.all-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', function() {
                        const targetListId = this.dataset.target;
                        const list = document.getElementById(targetListId);
                        const isChecked = this.checked;
                        const items = list.querySelectorAll('.item-checkbox');
                        
                        // 确保能正确选中/取消选中所有场景项
                        items.forEach(item => {
                            item.checked = isChecked;
                        });
                        
                        CRMApp.updateCount(targetListId);
                        CRMApp.syncAllCheckbox(targetListId);
                    });
                });
                
                // 绑定批量移动按钮事件
                const hideSceneBtn = document.getElementById('hide-scene-btn');
                const showSceneBtn = document.getElementById('show-scene-btn');
                
                // 移除旧事件监听器
                const newHideSceneBtn = hideSceneBtn.cloneNode(true);
                hideSceneBtn.parentNode.replaceChild(newHideSceneBtn, hideSceneBtn);
                
                const newShowSceneBtn = showSceneBtn.cloneNode(true);
                showSceneBtn.parentNode.replaceChild(newShowSceneBtn, showSceneBtn);
                
                // 绑定新事件监听器
                newHideSceneBtn.addEventListener('click', () => {
                    CRMApp.moveItems('displayed-scenes', 'hidden-scenes');
                });
                
                newShowSceneBtn.addEventListener('click', () => {
                    CRMApp.moveItems('hidden-scenes', 'displayed-scenes');
                });
                
                // 绑定场景列表中的新建场景按钮事件
                document.querySelectorAll('.scene-new').forEach(btn => {
                    btn.addEventListener('click', function() {
                        CRMApp.showNewScenarioModal();
                    });
                });

                // 绑定场景项的拖放事件
                document.querySelectorAll('.scenario-item').forEach(item => {
                    item.draggable = true;

                    item.addEventListener('dragstart', function(e) {
                        this.classList.add('dragging');
                        e.dataTransfer.setData('text/plain', this.getAttribute('data-scenario'));
                    });

                    item.addEventListener('dragend', function() {
                        this.classList.remove('dragging');
                        document.querySelectorAll('.scenario-item').forEach(i => {
                            i.classList.remove('drag-over');
                        });
                    });

                    item.addEventListener('dragover', function(e) {
                        e.preventDefault();
                        const draggingItem = document.querySelector('.dragging');
                        if (draggingItem && draggingItem !== this) {
                            this.classList.add('drag-over');
                        }
                    });

                    item.addEventListener('dragleave', function() {
                        this.classList.remove('drag-over');
                    });

                    item.addEventListener('drop', function(e) {
                        e.preventDefault();
                        const draggingItem = document.querySelector('.dragging');
                        if (draggingItem && draggingItem !== this) {
                            const draggingScenario = draggingItem.getAttribute('data-scenario');
                            const dropScenario = this.getAttribute('data-scenario');

                            // 找到两个场景在场景数组中的索引
                            const draggingIndex = CRMApp.scenarios.findIndex(s => s.name === draggingScenario);
                            const dropIndex = CRMApp.scenarios.findIndex(s => s.name === dropScenario);

                            // 确保两个场景都存在
                            if (draggingIndex !== -1 && dropIndex !== -1) {
                                // 调整场景顺序
                                const temp = CRMApp.scenarios[draggingIndex];
                                CRMApp.scenarios.splice(draggingIndex, 1);
                                CRMApp.scenarios.splice(dropIndex, 0, temp);

                                // 保存场景设置
                                localStorage.setItem('crm_scenarios', JSON.stringify(CRMApp.scenarios));

                                // 重新刷新列表
                                CRMApp.refreshScenarioList();
                            }
                        }
                        this.classList.remove('drag-over');
                    });
                });
            },
            
            // 更新列表计数
            updateCount: function(listId) {
                const list = document.getElementById(listId);
                if (!list) return;
                
                const allItems = list.querySelectorAll('.scenario-item');
                let checkedCount = 0;
                
                // 使用兼容的方式计算选中项数量
                list.querySelectorAll('.item-checkbox').forEach(checkbox => {
                    if (checkbox.checked) {
                        checkedCount++;
                    }
                });
                
                const countText = list.parentNode.querySelector('.count-text');
                
                if (countText) {
                    countText.textContent = `${checkedCount}/${allItems.length}`;
                }
            },
            
            // 同步全选框状态
            syncAllCheckbox: function(listId) {
                const list = document.getElementById(listId);
                if (!list) return;
                
                const allCheckbox = list.parentNode.querySelector('.all-checkbox');
                const allItems = list.querySelectorAll('.item-checkbox');
                let checkedCount = 0;
                
                // 使用兼容的方式计算选中项数量
                allItems.forEach(checkbox => {
                    if (checkbox.checked) {
                        checkedCount++;
                    }
                });
                
                if (allCheckbox) {
                    allCheckbox.checked = allItems.length > 0 && checkedCount === allItems.length;
                }
            },
            
            // 移动选中的场景项
            moveItems: function(fromListId, toListId) {
                const fromList = document.getElementById(fromListId);
                const toList = document.getElementById(toListId);
                
                if (!fromList || !toList) return;
                
                // 使用兼容的方式获取选中项
                const checkboxes = fromList.querySelectorAll('.item-checkbox:checked');
                const selectedItems = [];
                
                checkboxes.forEach(checkbox => {
                    const item = checkbox.closest('.scenario-item');
                    if (item) {
                        selectedItems.push(item);
                    }
                });
                
                if (selectedItems.length === 0) {
                    this.showNotification('请先勾选需要移动的场景！', 'warning');
                    return;
                }
                
                // 检查是否有默认场景被选中（除了'全部'场景）
                const defaultScenario = localStorage.getItem('crm_default_scenario');
                const hasDefaultScenario = selectedItems.some(item => {
                    const scenarioName = item.getAttribute('data-scenario');
                    return scenarioName === defaultScenario && scenarioName !== '全部';
                });
                
                if (hasDefaultScenario) {
                    this.showNotification('默认场景不可移动！', 'warning');
                    return;
                }
                
                // 更新场景的visibility属性
                selectedItems.forEach(item => {
                    const scenarioName = item.getAttribute('data-scenario');
                    const scenario = this.scenarios.find(s => s.name === scenarioName);
                    
                    if (scenario) {
                        // 允许移动'全部'场景
                        scenario.visibility = (toListId === 'displayed-scenes') ? 'visible' : 'hidden';
                    }
                });
                
                // 保存场景设置
                localStorage.setItem('crm_scenarios', JSON.stringify(this.scenarios));
                
                // 重新刷新列表
                this.refreshScenarioList();
                
                // 取消全选框的勾选状态
                const fromPanel = document.getElementById(fromListId).closest('.scene-panel');
                const allCheckbox = fromPanel.querySelector('.all-checkbox');
                if (allCheckbox) {
                    allCheckbox.checked = false;
                }
                
                // 显示通知
                this.showNotification(`已成功移动 ${selectedItems.length} 个场景`, 'success');
            },

            // 显示高级筛选模态框
            showAdvancedFilterModal: function() {
                const modal = document.getElementById('advanced-filter-modal');
                
                // 清空现有条件容器
                const container = document.getElementById('advanced-filter-conditions-container');
                container.innerHTML = '';
                
                // 如果有高级筛选条件，则加载到模态框中
                if (this.advancedFilterConditions && this.advancedFilterConditions.length > 0) {
                    this.advancedFilterConditions.forEach((condition, index) => {
                        this.addAdvancedConditionRow(condition, index);
                    });
                } else {
                    // 添加一个初始的筛选条件行
                    this.addAdvancedConditionRow();
                }
                
                // 显示模态框
                modal.style.display = 'flex';
                
                // 绑定关闭按钮事件
                const closeBtn = document.getElementById('close-advanced-filter-modal');
                closeBtn.addEventListener('click', () => {
                    this.closeModal('advanced-filter-modal');
                });
                
                // 绑定添加筛选条件按钮事件
                const addBtn = document.getElementById('add-advanced-condition-btn');
                addBtn.addEventListener('click', () => {
                    this.addAdvancedConditionRow();
                });
                
                // 绑定应用筛选按钮事件
                const applyBtn = document.getElementById('apply-advanced-filter-btn');
                applyBtn.addEventListener('click', () => {
                    this.applyAdvancedFilter();
                    this.closeModal('advanced-filter-modal');
                });
                
                // 绑定取消按钮事件
                const cancelBtn = document.getElementById('cancel-advanced-filter-btn');
                cancelBtn.addEventListener('click', () => {
                    this.closeModal('advanced-filter-modal');
                });
                
                // 绑定重置按钮事件
                const resetBtn = document.getElementById('reset-advanced-filter-btn');
                resetBtn.addEventListener('click', () => {
                    this.resetAdvancedFilter();
                    this.closeModal('advanced-filter-modal');
                });
            },
            
            // 添加高级筛选条件行
            addAdvancedConditionRow: function(condition = null, index = null) {
                const container = document.getElementById('advanced-filter-conditions-container');
                const rowIndex = index !== null ? index : container.children.length;
                
                const row = document.createElement('div');
                row.className = 'filter-row';
                row.innerHTML = `
                    <select class="field-select" data-index="${rowIndex}">
                        <option value="customerName">客户名称</option>
                        <option value="phone">手机</option>
                        <option value="customerLevel">客户级别</option>
                        <option value="callStatus">接通状态</option>
                        <option value="remark">备注</option>
                        <option value="responsiblePerson">负责人</option>
                        <option value="department">所属部门</option>
                    </select>
                    <select class="operator-select" data-index="${rowIndex}">
                        <option value="contains">包含</option>
                        <option value="equals">等于</option>
                        <option value="notEquals">不等于</option>
                        <option value="greaterThan">大于</option>
                        <option value="lessThan">小于</option>
                        <option value="startsWith">以...开头</option>
                        <option value="endsWith">以...结尾</option>
                    </select>
                    <input type="text" class="value-input" data-index="${rowIndex}" placeholder="请输入值">
                    <button class="del-btn" data-index="${rowIndex}" onclick="CRMApp.deleteAdvancedConditionRow(${rowIndex})">×</button>
                `;
                
                // 如果有条件数据，设置默认值
                if (condition) {
                    const fieldSelect = row.querySelector('.field-select');
                    const operatorSelect = row.querySelector('.operator-select');
                    const valueInput = row.querySelector('.value-input');
                    
                    fieldSelect.value = condition.field;
                    operatorSelect.value = condition.operator;
                    valueInput.value = condition.value;
                }
                
                container.appendChild(row);

                // 为新添加的删除按钮绑定点击事件
                const delBtn = row.querySelector('.del-btn');
                delBtn.onclick = () => { CRMApp.deleteAdvancedConditionRow(rowIndex); };
                
                // 绑定字段选择变化事件和操作符选择变化事件
                const fieldSelect = row.querySelector('.field-select');
                const operatorSelect = row.querySelector('.operator-select');
                const valueInput = row.querySelector('.value-input');
                
                // 创建值容器
                const valueContainer = document.createElement('div');
                valueContainer.className = 'value-container';
                valueContainer.setAttribute('data-index', rowIndex);
                valueContainer.appendChild(valueInput);
                row.insertBefore(valueContainer, delBtn);
                
                // 初始化值输入框
                CRMApp.updateAdvancedValueInput(fieldSelect.value, operatorSelect.value, valueContainer, rowIndex);
                
                // 绑定字段选择变化事件
                fieldSelect.addEventListener('change', (e) => {
                    const field = e.target.value;
                    const operator = row.querySelector('.operator-select').value;
                    CRMApp.updateAdvancedValueInput(field, operator, valueContainer, rowIndex);
                });
                
                // 绑定操作符选择变化事件
                operatorSelect.addEventListener('change', (e) => {
                    const field = row.querySelector('.field-select').value;
                    const operator = e.target.value;
                    CRMApp.updateAdvancedValueInput(field, operator, valueContainer, rowIndex);
                });
            },
            
            // 删除高级筛选条件行
            deleteAdvancedConditionRow: function(index) {
                const container = document.getElementById('advanced-filter-conditions-container');
                const rows = container.querySelectorAll('.filter-row');
                
                if (index >= 0 && index < rows.length) {
                    container.removeChild(rows[index]);
                    
                    // 更新剩余行的索引
                    const remainingRows = container.querySelectorAll('.filter-row');
                    remainingRows.forEach((row, newIndex) => {
                        const fieldSelect = row.querySelector('.field-select');
                        const operatorSelect = row.querySelector('.operator-select');
                        const valueContainer = row.querySelector('.value-container');
                        const delBtn = row.querySelector('.del-btn');
                        
                        fieldSelect.dataset.index = newIndex;
                        operatorSelect.dataset.index = newIndex;
                        valueContainer.dataset.index = newIndex;
                        
                        // 更新值输入框的索引
                        const valueInput = row.querySelector('.value-input, .value-select');
                        if (valueInput) {
                            valueInput.dataset.index = newIndex;
                        }
                        
                        delBtn.dataset.index = newIndex;
                        delBtn.onclick = () => { CRMApp.deleteAdvancedConditionRow(newIndex); };
                    });
                }
            },
            
            // 应用高级筛选
            applyAdvancedFilter: function() {
                const container = document.getElementById('advanced-filter-conditions-container');
                const rows = container.querySelectorAll('.filter-row');
                
                const conditions = [];
                rows.forEach(row => {
                    const field = row.querySelector('.field-select').value;
                    const operator = row.querySelector('.operator-select').value;
                    const valueInput = row.querySelector('.value-input, .value-select');
                    const value = valueInput ? valueInput.value.trim() : '';
                    
                    if (value) {
                        conditions.push({ field, operator, value });
                    }
                });
                
                // 保存高级筛选条件
                this.advancedFilterConditions = conditions;
                
                // 这里可以添加筛选逻辑
                // 例如：根据conditions筛选this.customers数组
                console.log('应用高级筛选条件:', conditions);
                
                // 更新显示
                this.currentPageIndex = 1;
                this.displayCustomers();
                this.setupPagination();
                
                this.showNotification('高级筛选已应用', 'success');
            },
            
            // 重置高级筛选
            resetAdvancedFilter: function() {
                // 清空高级筛选条件
                this.advancedFilterConditions = [];
                
                // 更新显示
                this.currentPageIndex = 1;
                this.displayCustomers();
                this.setupPagination();
                
                this.showNotification('高级筛选已重置', 'success');
            },

            // 显示场景条件设置模态框
            showScenarioConditionsModal: function(scenarioName) {
    const modal = document.getElementById('scenario-conditions-modal');
    const title = document.getElementById('edit-scenario-title');
    
    // 设置模态框标题
    title.textContent = `编辑场景 - ${scenarioName}`;
    
    // 保存当前场景名称到模态框元素
    modal.setAttribute('data-scenario', scenarioName);
    
    // 查找场景
    const scenario = this.scenarios.find(s => s.name === scenarioName);
    if (!scenario) {
        this.showNotification('场景不存在', 'error');
        return;
    }
    
    // 更新场景名称输入框
    document.getElementById('edit-scenario-name').value = scenarioName;
    
    // 更新默认场景复选框
    const defaultScenario = localStorage.getItem('crm_default_scenario');
    document.getElementById('edit-set-default').checked = scenarioName === defaultScenario;
    
    // 清空现有条件容器
    const container = document.getElementById('edit-scenario-conditions-container');
    container.innerHTML = '';
    
    // 加载现有条件
    if (scenario.conditions && scenario.conditions.length > 0) {
        scenario.conditions.forEach((condition, index) => {
            this.addEditConditionRow(condition, index);
        });
    } else {
        // 如果没有条件，显示提示
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-conditions';
        //emptyMessage.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无筛选条件</p>';
        container.appendChild(emptyMessage);
    }
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 绑定事件
    const closeBtn = document.getElementById('close-scenario-conditions-modal');
    const cancelBtn = document.getElementById('cancel-scenario-conditions-btn');
    const saveBtn = document.getElementById('save-scenario-conditions-btn');
    const addBtn = document.getElementById('add-edit-condition-btn');
    
    // 使用cloneNode移除旧事件监听器
    const newCloseBtn = closeBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newSaveBtn = saveBtn.cloneNode(true);
    const newAddBtn = addBtn.cloneNode(true);
    
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    
    // 绑定新事件
    newCloseBtn.addEventListener('click', () => {
        this.closeModal('scenario-conditions-modal');
    });
    
    newCancelBtn.addEventListener('click', () => {
        this.closeModal('scenario-conditions-modal');
    });
    
    newSaveBtn.addEventListener('click', () => {
        this.saveScenarioConditions();
    });
    
    newAddBtn.addEventListener('click', () => {
        const container = document.getElementById('edit-scenario-conditions-container');
        
        // 如果当前显示的是空提示，先移除它
        const emptyMessage = container.querySelector('.empty-conditions');
        if (emptyMessage) {
            emptyMessage.remove();
        }
        
        // 添加新条件行（空条件）
        const newCondition = { field: '', operator: '=', value: '' };
        const index = container.children.length;
        this.addEditConditionRow(newCondition, index);
    });
},

            // 添加条件行
            addConditionRow: function() {
                const container = document.getElementById('conditions-container');
                const scenarioName = document.getElementById('scenario-conditions-modal').getAttribute('data-scenario');
                const scenario = this.scenarios.find(s => s.name === scenarioName);
                
                if (!scenario) return;
                
                // 添加新条件到场景
                const newCondition = { field: 'customerLevel', operator: '=', value: '' };
                scenario.conditions.push(newCondition);
                
                // 添加到DOM
                const div = document.createElement('div');
                div.innerHTML = this.getConditionRowHTML(newCondition, scenario.conditions.length - 1);
                container.appendChild(div.firstChild);
                
                // 为新添加的条件行绑定事件
                this.bindConditionEvents();
            },

            // 删除条件行
            deleteConditionRow: function(index) {
                const container = document.getElementById('conditions-container');
                
                // 由于现在只有一个条件行，不允许删除
                // 如果需要支持多个条件行，需要修改容器结构
                alert('至少需要保留一个条件');
                return;
            },

            // 显示账户创建模态框
            showCreateAccountModal: function() {
                const modal = document.getElementById('create-account-modal');
                if (modal) {
                    // 填充部门自定义下拉列表
                    const departmentInput = document.getElementById('account-department');
                    const dropdown = document.getElementById('account-department-dropdown');
                    if (departmentInput && dropdown) {
                        // 清空现有选项
                        dropdown.innerHTML = '';
                        
                        // 获取所有唯一部门
                        const departments = this.getUniqueDepartments();
                        
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
                    }
                    
                    modal.style.display = 'flex';
                    
                    // 绑定模态框事件
                    document.getElementById('close-create-account-modal')?.addEventListener('click', () => {
                        this.closeModal('create-account-modal');
                    });
                    
                    document.getElementById('cancel-create-account-btn')?.addEventListener('click', () => {
                        this.closeModal('create-account-modal');
                    });
                    
                    document.getElementById('save-create-account-btn')?.addEventListener('click', () => {
                        this.saveNewAccount();
                    });
                    
                    // 点击模态框外部关闭
                    window.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            this.closeModal('create-account-modal');
                        }
                    });
                }
            },
            
            // 保存新账户
            saveNewAccount: async function() {
                // 获取表单数据
                const username = document.getElementById('account-username')?.value.trim();
                const password = document.getElementById('account-password')?.value;
                const name = document.getElementById('account-name')?.value.trim();
                const department = document.getElementById('account-department')?.value.trim();
                const position = document.getElementById('account-position')?.value.trim();
                const roleId = parseInt(document.getElementById('account-role')?.value) || 3;
                
                // 验证必填字段
                if (!username || !password || !name) {
                    this.showAlert('错误', '账号、密码和姓名为必填项');
                    return;
                }
                
                try {
                    // 调用API创建账户
                    const result = await this.createAccount({
                        username,
                        password,
                        name,
                        department,
                        position,
                        roleId,
                        status: 'active'
                    });
                    
                    // 关闭模态框
                    this.closeModal('create-account-modal');
                    
                    // 显示成功提示
                    this.showNotification('账户创建成功', 'success');
                } catch (e) {
                    this.showNotification(e.message || '账户创建失败', 'error');
                }
            },
            
            // 保存场景条件
            saveScenarioConditions: function() {
    const modal = document.getElementById('scenario-conditions-modal');
    const scenarioName = modal.getAttribute('data-scenario');
    const newScenarioName = document.getElementById('edit-scenario-name').value.trim();
    const isDefault = document.getElementById('edit-set-default').checked;
    
    if (!newScenarioName) {
        this.showNotification('请输入场景名称', 'warning');
        return;
    }
    
    // 查找场景索引
    const scenarioIndex = this.scenarios.findIndex(s => s.name === scenarioName);
    if (scenarioIndex === -1) {
        this.showNotification('场景不存在', 'error');
        return;
    }
    
    // 检查名称是否已存在（排除自身）
    if (newScenarioName !== scenarioName && this.scenarios.some(s => s.name === newScenarioName)) {
        this.showNotification('该场景名称已存在', 'warning');
        return;
    }
    
    // 获取所有条件
    const container = document.getElementById('edit-scenario-conditions-container');
    const rows = container.querySelectorAll('.filter-row');
    const conditions = [];
    
    rows.forEach(row => {
        const fieldSelect = row.querySelector('.field-select');
        const operatorSelect = row.querySelector('.operator-select');
        const valueContainer = row.querySelector('.value-container');
        
        const field = fieldSelect ? fieldSelect.value : '';
        const operator = operatorSelect ? operatorSelect.value : '=';
        
        let value = '';
        if (valueContainer) {
            const valueSelect = valueContainer.querySelector('.value-select');
            const valueInput = valueContainer.querySelector('.value-input');
            
            if (valueSelect) {
                value = valueSelect.value;
            } else if (valueInput) {
                value = valueInput.value.trim();
            }
        }
        
        // 只有字段不为空时才添加条件
        if (field) {
            conditions.push({ 
                field: field, 
                operator: operator,
                value: value 
            });
        }
    });
    
    // 更新场景
    this.scenarios[scenarioIndex] = {
        ...this.scenarios[scenarioIndex],
        name: newScenarioName,
        conditions: conditions // 可以为空数组
    };
    
    // 如果设为默认，更新默认场景
    if (isDefault) {
        localStorage.setItem('crm_default_scenario', newScenarioName);
        // 更新当前默认场景标记
        this.currentFilter = newScenarioName;
    } else {
        // 如果取消默认，且当前是默认场景，则清除默认设置
        const currentDefault = localStorage.getItem('crm_default_scenario');
        if (currentDefault === scenarioName) {
            localStorage.removeItem('crm_default_scenario');
        }
    }
    
    // 保存场景数据（不关闭场景设置面板）
    this.saveScenarios(false);
    
    // 刷新场景列表
    this.refreshScenarioList();
    
    // 关闭模态框
    this.closeModal('scenario-conditions-modal');
    
    this.showNotification('场景已更新', 'success');
    this.addLog('场景设置', `更新了场景 "${newScenarioName}"`);
},
            
            // 保存个人资料
            saveProfile: async function() {
                const name = document.getElementById('profile-name').value.trim();
                const position = document.getElementById('profile-position').value.trim();
                const department = document.getElementById('profile-department').value.trim();
                
                if (!name) {
                    this.showNotification('姓名不能为空', 'warning');
                    return;
                }
                
                // 除超级管理员外，其他用户不允许修改部门
                if (this.currentUser.roleId !== 1) {
                    this.currentUser.department = this.currentUser.department || '';
                } else {
                    this.currentUser.department = department;
                }
                
                // 同步更新组长和员工部门
                const savedGroupLeaders = localStorage.getItem('crm_group_leaders');
                if (savedGroupLeaders) {
                    let groupLeadersData = JSON.parse(savedGroupLeaders);
                    
                    // 检查当前用户是否是组长
                    groupLeadersData.forEach((leader, index) => {
                        if (leader.name.includes(this.currentUser.name)) {
                            // 更新组长的部门
                            leader.department = this.currentUser.department;
                            // 更新该组长管理的所有员工的部门
                            leader.members.forEach(memberId => {
                                const member = this.accounts.find(a => a.id == memberId);
                                if (member) {
                                    member.department = this.currentUser.department;
                                }
                            });
                        }
                    });
                    
                    // 保存更新后的组长数据
                    localStorage.setItem('crm_group_leaders', JSON.stringify(groupLeadersData));
                    // 保存更新后的员工数据
                    this.saveAccounts();
                }
                
                // 更新当前用户信息
                this.currentUser.name = name;
                this.currentUser.position = position;
                
                try {
                    // 同步到API
                    const response = await fetch(`/api/accounts/${this.currentUser.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            username: this.currentUser.username,
                            name: name,
                            position: position,
                            department: this.currentUser.department,
                            roleId: this.currentUser.roleId,
                            status: this.currentUser.status,
                            currentUsername: this.currentUser.username
                        })
                    });
                    
                    if (response.ok) {
                        // 保存到localStorage
                        localStorage.setItem('crm_user', JSON.stringify(this.currentUser));
                        
                        // 更新UI
                        this.updateUserInfo();
                        this.updateSidebar();
                        
                        this.showNotification('个人资料已保存', 'success');
                        this.addLog('个人资料', '修改了个人资料');
                        
                        // 延迟返回仪表盘
                        setTimeout(() => {
                            this.loadPage('dashboard');
                        }, 1000);
                    } else {
                        this.showNotification('保存失败，请稍后重试', 'error');
                    }
                } catch (error) {
                    console.error('保存个人资料失败:', error);
                    this.showNotification('保存失败，请稍后重试', 'error');
                }
            },
            
            // 关闭模态框
            closeModal: function(modalId) {
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.style.display = 'none';
                }
                
                // 重置文件输入框
                if (modalId === 'import-customer-modal' || modalId === 'import-progress-modal') {
                    const fileInput = document.getElementById('file-input-hidden');
                    const fileNameInput = document.getElementById('file-name-input');
                    const fileInfo = document.getElementById('file-info');
                    
                    if (fileInput) {
                        // 重置文件输入框
                        fileInput.value = '';
                    }
                    
                    if (fileNameInput) {
                        // 重置文件名显示
                        fileNameInput.value = '未选择文件';
                    }
                    
                    if (fileInfo) {
                        // 重置文件信息
                        fileInfo.innerHTML = '';
                    }
                    
                    // 重置导入按钮状态
                    const importBtn = document.getElementById('start-import-btn');
                    if (importBtn) {
                        importBtn.disabled = false;
                    }
                }
            },
            
            // 显示确认弹窗
            showConfirm: function(title, message, onConfirm) {
                document.getElementById('confirm-title').textContent = title;
                document.getElementById('confirm-message').innerHTML = message;
                
                const modal = document.getElementById('custom-confirm-modal');
                modal.style.display = 'flex';
                
                // 移除旧的确认事件监听器
                const okBtn = document.getElementById('confirm-ok-btn');
                const newOkBtn = okBtn.cloneNode(true);
                okBtn.parentNode.replaceChild(newOkBtn, okBtn);
                
                // 绑定新的确认事件
                newOkBtn.addEventListener('click', () => {
                    this.closeModal('custom-confirm-modal');
                    if (onConfirm) onConfirm();
                });
                
                // 绑定取消事件
                document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
                    this.closeModal('custom-confirm-modal');
                });
            },
            
            // 显示提示弹窗
            showAlert: function(title, message) {
                document.getElementById('alert-title').textContent = title;
                document.getElementById('alert-message').innerHTML = message;
                
                const modal = document.getElementById('custom-alert-modal');
                modal.style.display = 'flex';
            },
            
            // 退出登录
            logout: function() {
                this.showConfirm(
                    '确认退出',
                    '确定要退出登录吗？',
                    () => {
                        localStorage.removeItem('crm_user');
                        window.location.href = 'login.html';
                    }
                );
            },
            
            // 显示通知
            showNotification: function(message, type = 'success') {
                const notification = document.createElement('div');
                notification.className = `notification ${type}`;
                notification.innerHTML = `
                    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-times-circle'}"></i>
                    <span>${message}</span>
                `;
                
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    notification.style.opacity = '0';
                    notification.style.transform = 'translateX(100%)';
                    setTimeout(() => {
                        notification.remove();
                    }, 300);
                }, 3000);
            },
            
            // 导入客户数据
            importCustomers: function(file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = e.target.result;
                        let customers = [];
                        
                        // 处理CSV文件
                        if (file.name.endsWith('.csv')) {
                            const lines = data.split('\n');
                            const headers = lines[0].split(',').map(header => header.trim());
                            
                            for (let i = 1; i < lines.length; i++) {
                                const line = lines[i].trim();
                                if (line) {
                                    const values = line.split(',');
                                    const customer = {};
                                    
                                    for (let j = 0; j < headers.length; j++) {
                                        customer[headers[j]] = values[j] ? values[j].trim() : '';
                                    }
                                    
                                    // 确保客户数据有必要的字段
                                    if (customer.name && customer.phone) {
                                        customer.id = Date.now() + Math.random();
                                        customer.createdAt = new Date().toISOString();
                                        customer.updatedAt = new Date().toISOString();
                                        customer.updateTime = this.formatDateTime(new Date());
                                        customer.owner = this.currentUser.name;
                                        customer.department = this.currentUser.department;
                                        customers.push(customer);
                                    }
                                }
                            }
                        } else {
                            // 处理Excel文件（简化版，实际需要第三方库支持）
                            this.showAlert('Excel文件导入', '此功能需要Excel处理库支持，请使用CSV格式导入。');
                            return;
                        }
                        
                        // 导入数据
                        this.customers = this.customers.concat(customers);
                        this.saveCustomers();
                        this.displayCustomers();
                        this.setupPagination();
                        
                        this.showNotification(`成功导入 ${customers.length} 条客户数据`, 'success');
                    } catch (error) {
                        console.error('导入数据失败:', error);
                        this.showNotification('导入数据失败，请检查文件格式', 'error');
                    }
                };
                
                if (file.name.endsWith('.csv')) {
                    reader.readAsText(file);
                } else {
                    reader.readAsArrayBuffer(file);
                }
            },
            
            // 导出客户数据
            exportCustomers: function() {
                // 获取当前筛选后的客户数据
                const filteredCustomers = this.getFilteredCustomers();
                
                // 构建CSV内容
                const headers = ['id', 'name', 'phone', 'email', 'address', 'customerLevel', 'owner', 'department', 'createdAt'];
                const rows = [headers.join(',')];
                
                filteredCustomers.forEach(customer => {
                    const row = headers.map(header => {
                        const value = String(customer[header] || '');
                        return `"${value.replace(/"/g, '""')}"`;
                    });
                    rows.push(row.join(','));
                });
                
                const csvContent = rows.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `客户数据_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                this.showNotification(`成功导出 ${filteredCustomers.length} 条客户数据`, 'success');
            }
        };

        // 将CRMApp挂载到window对象，使全局可访问
        window.crmApp = CRMApp;

        // 初始化应用
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM已加载，开始初始化CRM应用');
            CRMApp.init();
        });
    