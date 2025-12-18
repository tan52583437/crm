// 接通状态下拉框功能
        function showCallStatusOptions(e) {
            e.stopPropagation();
            const options = document.getElementById('call-status-options');
            options.style.display = options.style.display === 'none' ? 'block' : 'none';
        }
        
        function selectCallStatus(status) {
            const input = document.getElementById('edit-call-status');
            input.value = status;
            document.getElementById('call-status-options').style.display = 'none';
            // 显示清除按钮
            input.nextElementSibling.style.display = 'block';
        }
        
        function validateCallStatus(input) {
            const validStatuses = ['已接通', '未接通', '忙线', '无人接听'];
            if (input.value && !validStatuses.includes(input.value)) {
                input.style.borderColor = '#f72585';
                input.setCustomValidity('请输入有效的接通状态');
            } else {
                input.style.borderColor = '#ced4da';
                input.setCustomValidity('');
            }
        }
        
        // 客户级别下拉框功能
        function showCustomerLevelOptions(e) {
            e.stopPropagation();
            const options = document.getElementById('customer-level-options');
            options.style.display = options.style.display === 'none' ? 'block' : 'none';
        }
        
        function selectCustomerLevel(level) {
            const input = document.getElementById('edit-customer-level');
            input.value = level;
            document.getElementById('customer-level-options').style.display = 'none';
            // 显示清除按钮
            input.nextElementSibling.style.display = 'block';
        }
        
        function validateCustomerLevel(input) {
            const validLevels = ['A类客户', 'B类客户', 'C类客户', '黑名单'];
            if (input.value && !validLevels.includes(input.value)) {
                input.style.borderColor = '#f72585';
                input.setCustomValidity('请输入有效的客户级别');
            } else {
                input.style.borderColor = '#ced4da';
                input.setCustomValidity('');
            }
        }

        // 点击页面其他地方关闭下拉框
        document.addEventListener('click', (e) => {
            const callStatusOptions = document.getElementById('call-status-options');
            const customerLevelOptions = document.getElementById('customer-level-options');
            const isCallStatusTrigger = e.target.closest('#edit-call-status') || e.target.closest('#call-status-options');
            const isCustomerLevelTrigger = e.target.closest('#level-trigger') || e.target.closest('#customer-level-options');
            
            if (callStatusOptions && !isCallStatusTrigger) {
                callStatusOptions.style.display = 'none';
            }
            if (customerLevelOptions && !isCustomerLevelTrigger) {
                customerLevelOptions.style.display = 'none';
            }
        });
        
        // 点击页面其他地方关闭下拉选项
        document.addEventListener('click', function(e) {
            const callStatusOptions = document.getElementById('call-status-options-index');
            if (callStatusOptions && !e.target.closest('#status-trigger-index') && !e.target.closest('#call-status-options-index')) {
                callStatusOptions.style.display = 'none';
            }
            const customerLevelOptions = document.getElementById('customer-level-options-index');
            if (customerLevelOptions && !e.target.closest('#level-trigger-index') && !e.target.closest('#customer-level-options-index')) {
                customerLevelOptions.style.display = 'none';
            }
        });

        // 字段编辑模态框功能
        window.crmApp = window.crmApp || {};
        
        // 关闭模态框
        crmApp.closeModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('show');
                modal.style.display = 'none';
            }
        };
        
        // 打开字段编辑模态框
        crmApp.openFieldModal = function(fieldName) {
            const modal = document.getElementById('field-modal');
            const modalTitle = document.getElementById('field-modal-title');
            
            // 映射字段名称到显示名称
            const fieldDisplayNameMap = {
                'callStatus': '接通状态',
                'department': '部门名称',
                'position': '岗位',
                'customerLevel': '客户级别'
            };
            
            const displayName = fieldDisplayNameMap[fieldName] || fieldName;
            modalTitle.textContent = '编辑' + displayName;
            
            // 动态生成字段选项
            const optionsContainer = document.getElementById('field-options-container');
            optionsContainer.innerHTML = '';
            
            // 保存当前编辑的字段名称
            crmApp.currentEditingField = fieldName;
            
            };