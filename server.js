const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// 导入Supabase客户端
const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = 'https://mguxwivhdtswdohsuflc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ndXh3aXZoZHRzd2RvaHN1ZmxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzE5NTgsImV4cCI6MjA4MTUwNzk1OH0.CEGohssiCONvXihC_rCMa3dxDkDb5mBWzysQl1DI88o';
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// 初始化Supabase用户表
async function initSupabaseTable() {
  try {
    // 尝试查询表，检查是否存在
    const { error } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (error) {
      if (error.code === '42P01') { // 表不存在
        console.log('⚠️ 警告：用户表不存在');
        console.log('请在Supabase控制台手动创建表，执行以下SQL:');
        console.log(`
CREATE TABLE public.users (
  id UUID primary key,
  account TEXT unique not null,
  name TEXT not null,
  position TEXT,
  role TEXT default '3',
  department TEXT,
  status BOOLEAN default true,
  password TEXT not null,
  created_at TIMESTAMPTZ default now(),
  last_login TIMESTAMPTZ
);
`);
        // 不返回false，继续启动服务器
      }
    } else {
      console.log('✓ 用户表检查成功');
    }
    
    return true;
  } catch (error) {
    console.error('初始化Supabase表失败:', error);
    return true; // 继续启动服务器，即使检查失败
  }
}

// 角色映射函数：将角色ID转换为对应的角色标签
function getRoleLabel(roleId) {
  const roleMap = {
    '1': '超级管理员',
    '2': '组长',
    '3': '员工'
  };
  return roleMap[roleId] || '员工';
}

// 健康检查
app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

// 获取所有账户
app.get('/api/accounts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) {
      return res.status(500).json({ ok: false, message: '获取账户列表失败' });
    }
    
    const sanitized = data.map(a => {
      // 移除密码
      const { password: accountPassword, ...safe } = a;
      // 转换字段名以匹配前端期望的格式
      return {
        id: a.id,
        username: a.account,
        name: a.name || a.account, // 使用name字段，如果没有则使用account
        position: a.position || '',
        role: getRoleLabel(a.role || '3'), // 转换为角色标签
        roleId: parseInt(a.role) || 3, // 转换role为数字roleId
        department: a.department || '',
        status: a.status ? 'active' : 'inactive',
        createdAt: a.created_at || new Date().toISOString()
      };
    });
    
    res.json(sanitized);
  } catch (error) {
    console.error('获取所有账户失败:', error);
    res.status(500).json({ ok: false, message: '服务器内部错误' });
  }
});

// 获取单个账户
app.get('/api/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: account, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      return res.status(404).json({ ok: false, message: '账户不存在' });
    }
    
    // 移除密码
    const { password: accountPassword, ...safe } = account;
    
    // 转换字段名以匹配前端期望的格式
    const formattedAccount = {
      id: account.id,
      username: account.account,
      name: account.name || account.account, // 使用name字段，如果没有则使用account
      position: account.position || '',
      role: getRoleLabel(account.role || '3'), // 转换为角色标签
      roleId: parseInt(account.role) || 3, // 转换role为数字roleId
      department: account.department || '',
      status: account.status ? 'active' : 'inactive',
      createdAt: account.created_at || new Date().toISOString()
    };
    
    res.json({ ok: true, account: formattedAccount });
  } catch (error) {
    console.error('获取单个账户失败:', error);
    res.status(500).json({ ok: false, message: '服务器内部错误' });
  }
});

// 创建账户
app.post('/api/accounts', async (req, res) => {
  try {
    const { username, password, department, position, roleId, status, name } = req.body;
    
    console.log('收到创建账户请求:', { username, name, department, position, roleId, status });
    
    if (!username || !password) {
      console.log('创建账户失败: 缺少必填字段');
      return res.status(400).json({ ok: false, message: '缺少必填字段' });
    }

    // 检查账号是否已存在
    const { data: existingAccount, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('account', String(username))
      .single();
      
    if (checkError && checkError.code !== 'PGRST116') { // PGRST116表示没有找到记录
      console.error('检查账号是否存在失败:', checkError);
      return res.status(500).json({ ok: false, message: '检查账号失败' });
    }
      
    if (existingAccount) {
      console.log('创建账户失败: 账号已存在');
      return res.status(400).json({ ok: false, message: '账号已存在' });
    }

    // 使用正确的字段名构建新账户
    const newAccount = {
      account: String(username),
      password: String(password),
      name: name || String(username), // 使用提供的name，否则使用username
      department: department || '',
      position: position || '',
      role: String(roleId) || '3',
      status: status === 'active' ? true : false
    };

    console.log('准备插入新账户:', newAccount);

    const { data: createdAccount, error } = await supabase
      .from('users')
      .insert(newAccount)
      .select('*')
      .single();

    if (error) {
      console.error('创建账户失败 - Supabase错误:', error);
      return res.status(500).json({ ok: false, message: '创建账户失败', error: error });
    }

    console.log('创建账户成功:', createdAccount.account);
    
    // 转换返回数据格式
    const { password: accountPassword, ...safe } = createdAccount;
    const formattedAccount = {
      id: createdAccount.id,
      username: createdAccount.account,
      name: createdAccount.name || createdAccount.account,
      position: createdAccount.position || '',
      role: getRoleLabel(createdAccount.role || '3'), // 转换为角色标签
      roleId: parseInt(createdAccount.role) || 3,
      department: createdAccount.department || '',
      status: createdAccount.status ? 'active' : 'inactive',
      createdAt: createdAccount.created_at || new Date().toISOString()
    };
    
    res.json({ ok: true, account: formattedAccount });
  } catch (error) {
    console.error('创建账户失败 - 系统错误:', error);
    res.status(500).json({ ok: false, message: '服务器内部错误', error: error.message });
  }
});

// 更新账户
app.put('/api/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, department, position, roleId, status, currentUsername, name } = req.body;
    
    console.log('收到更新账户请求:', { id, username, department, position, roleId, status, currentUsername });
    
    // 获取要更新的账户
    console.log('尝试获取要更新的账户，ID:', id);
    const { data: accountToUpdate, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      console.error('获取要更新的账户失败:', fetchError);
      return res.status(404).json({ ok: false, message: '账户不存在', error: fetchError });
    }
    console.log('成功获取要更新的账户:', accountToUpdate.account);

    // 禁止修改10000账户，除非当前登录用户就是10000
    if (accountToUpdate.account === '10000' && currentUsername !== '10000') {
      return res.status(403).json({ ok: false, message: '禁止修改该账户' });
    }
    
    // 禁止非10000账户修改其他超级管理员账户
    const { data: currentUser } = await supabase
      .from('users')
      .select('account, role')
      .eq('account', currentUsername)
      .single();
      
    if (currentUser && currentUser.account !== '10000' && parseInt(accountToUpdate.role) === 1) {
      return res.status(403).json({ ok: false, message: '禁止修改超级管理员账户' });
    }

    // 检查账号是否已存在（排除当前账户）
    const { data: existingAccount } = await supabase
      .from('users')
      .select('id')
      .eq('account', String(username))
      .neq('id', id)
      .single();
      
    if (existingAccount) {
      return res.status(400).json({ ok: false, message: '账号已存在' });
    }

    // 使用正确的字段名构建更新数据
    const updateData = {
      account: String(username),
      name: name || String(username), // 使用提供的name，否则使用username
      department: department || '',
      position: position || '',
      role: String(roleId) || '3',
      status: status === 'active' ? true : false
    };

    // 如果提供了新密码，则更新
    if (password) {
      updateData.password = String(password);
    }

    console.log('准备更新账户:', updateData);
    console.log('更新条件:', { id: id, table: 'users' });
    
    const { data: updatedAccount, error: updateError, count } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('*');

    console.log('Supabase更新结果:', { updatedAccount, updateError, count });

    if (updateError) {
      console.error('更新账户失败 - Supabase错误:', updateError);
      return res.status(500).json({ ok: false, message: '更新账户失败', error: updateError });
    }

    let finalAccount;
    // 检查是否有数据被更新
    if (!updatedAccount || updatedAccount.length === 0) {
      console.log('未检测到数据变化，重新获取最新数据');
      // 重新从数据库获取最新数据，确保返回的是当前状态
      const { data: latestAccount, error: latestError } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
      
      if (latestError) {
        console.error('获取最新账户数据失败:', latestError);
        return res.status(500).json({ ok: false, message: '获取最新数据失败', error: latestError });
      }
      
      finalAccount = latestAccount;
    } else {
      finalAccount = updatedAccount[0];
    }

    console.log('更新账户成功，返回数据:', finalAccount);
    
    // 转换返回数据格式
    const { password: accountPassword, ...safe } = finalAccount;
    const formattedAccount = {
      id: finalAccount.id,
      username: finalAccount.account,
      name: finalAccount.name || finalAccount.account,
      position: finalAccount.position || '',
      role: getRoleLabel(finalAccount.role || '3'), // 转换为角色标签
      roleId: parseInt(finalAccount.role) || 3, // 转换role为数字roleId
      department: finalAccount.department || '',
      status: finalAccount.status ? 'active' : 'inactive',
      createdAt: finalAccount.created_at || new Date().toISOString()
    };
    
    res.json({ ok: true, account: formattedAccount });
  } catch (error) {
    console.error('更新账户失败:', error);
    res.status(500).json({ ok: false, message: '服务器内部错误', error: error.message });
  }
});

// 删除账户
app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { currentUsername } = req.body;
    
    console.log('收到删除账户请求:', { id, currentUsername });
    
    // 获取要删除的账户
    const { data: accountToDelete, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      console.error('获取要删除的账户失败:', fetchError);
      return res.status(404).json({ ok: false, message: '账户不存在' });
    }

    // 禁止删除10000账户
    if (accountToDelete.account === '10000') {
      console.log('禁止删除账户10000');
      return res.status(403).json({ ok: false, message: '禁止删除该账户' });
    }
  
    // 禁止非10000账户删除其他超级管理员账户
    const { data: currentUser } = await supabase
      .from('users')
      .select('account, role')
      .eq('account', currentUsername)
      .single();
      
    if (currentUser && currentUser.account !== '10000' && parseInt(accountToDelete.role) === 1) {
      console.log('禁止非超级管理员删除超级管理员账户:', accountToDelete.account);
      return res.status(403).json({ ok: false, message: '禁止删除超级管理员账户' });
    }

    const { error, count } = await supabase
      .from('users')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('删除账户失败 - Supabase错误:', error);
      return res.status(500).json({ ok: false, message: '删除账户失败' });
    }

    if (!count || count === 0) {
      console.log('删除操作未影响任何行，ID:', id);
      return res.status(404).json({ ok: false, message: '账户不存在或删除失败' });
    }

    console.log('账户删除成功:', { id, count });
    res.json({ ok: true });
  } catch (error) {
    console.error('删除账户失败:', error);
    res.status(500).json({ ok: false, message: '服务器内部错误' });
  }
});

// 登录接口
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: '缺少 username 或 password' });
    }

    // 从Supabase获取用户
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('account', String(username))
      .single();

    if (error || !user) {
      return res.status(401).json({ ok: false, message: '账号或密码错误' });
    }

    // 验证密码 - 确保类型一致
    if (String(user.password) !== String(password)) {
      return res.status(401).json({ ok: false, message: '账号或密码错误' });
    }

    // 检查账户状态
    if (!user.status) {
      return res.status(403).json({ ok: false, message: '此账户已禁用，请联系管理员开通。' });
    }

    // 更新最后登录时间
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    const { password: _p, ...safe } = user;
    
    // 处理角色转换和name字段
    // 根据角色ID（字符串形式的数字）转换为前端需要的格式
    safe.roleId = parseInt(safe.role) || 3;
    safe.role = getRoleLabel(safe.role || '3'); // 转换为角色标签
    safe.name = safe.name || safe.account; // 确保name字段存在
    safe.username = safe.account; // 保持与前端兼容
    
    // 移除密码并返回安全的用户信息
    const { password: userPassword, ...userToReturn } = safe;
    res.json({ ok: true, user: userToReturn });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ ok: false, message: '服务器内部错误' });
  }
});

// 系统字段设置API
const FIELD_SETTINGS_FILE = path.join(__dirname, 'fieldSettings.json');
const FIELD_OPTIONS_FILE = path.join(__dirname, 'fieldOptions.json');

function loadFieldSettings() {
  try {
    const raw = fs.readFileSync(FIELD_SETTINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('无法读取 fieldSettings.json，返回默认设置', e);
    return { uniqueFields: ['客户名称', '手机'] };
  }
}

function saveFieldSettings(settings) {
  try {
    fs.writeFileSync(FIELD_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('保存 fieldSettings.json 失败', e);
  }
}

// 获取字段设置
app.get('/api/field-settings', (req, res) => {
  const settings = loadFieldSettings();
  res.json({ ok: true, settings });
});

// 保存字段设置
app.post('/api/field-settings', (req, res) => {
  const { uniqueFields } = req.body;
  if (!uniqueFields || !Array.isArray(uniqueFields)) {
    return res.status(400).json({ ok: false, message: '缺少必填字段 uniqueFields' });
  }
  const settings = loadFieldSettings();
  const updatedSettings = { ...settings, uniqueFields };
  saveFieldSettings(updatedSettings);
  res.json({ ok: true, settings: updatedSettings });
});

// 字段选项API
function loadFieldOptions() {
  try {
    const raw = fs.readFileSync(FIELD_OPTIONS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('无法读取 fieldOptions.json，返回默认选项', e);
    return {
      callStatus: [{'name': '已接通', 'value': '已接通'}, {'name': '未接听', 'value': '未接听'}, {'name': '空号', 'value': '空号'}, {'name': '关机', 'value': '关机'}, {'name': '拒接', 'value': '拒接'}],
      department: [{'name': '销售一部', 'value': '销售一部'}, {'name': '销售二部', 'value': '销售二部'}, {'name': '客服部', 'value': '客服部'}, {'name': '市场部', 'value': '市场部'}, {'name': '技术部', 'value': '技术部'}],
      position: [{'name': '销售经理', 'value': '销售经理'}, {'name': '销售主管', 'value': '销售主管'}, {'name': '销售专员', 'value': '销售专员'}, {'name': '客服专员', 'value': '客服专员'}, {'name': '市场专员', 'value': '市场专员'}],
      customerLevel: [{'name': 'A类客户', 'value': 'A类客户'}, {'name': 'B类客户', 'value': 'B类客户'}, {'name': 'C类客户', 'value': 'C类客户'}, {'name': '黑名单', 'value': '黑名单'}]
    };
  }
}

function saveFieldOptions(options) {
  try {
    fs.writeFileSync(FIELD_OPTIONS_FILE, JSON.stringify(options, null, 2), 'utf8');
  } catch (e) {
    console.error('保存 fieldOptions.json 失败', e);
  }
}

// 获取字段选项
app.get('/api/field-options', (req, res) => {
  const options = loadFieldOptions();
  res.json({ ok: true, options });
});

// 保存字段选项
app.post('/api/field-options', (req, res) => {
  const { fieldName, options } = req.body;
  if (!fieldName || !options || !Array.isArray(options)) {
    return res.status(400).json({ ok: false, message: '缺少必填字段 fieldName 或 options' });
  }
  try {
    const allOptions = loadFieldOptions();
    allOptions[fieldName] = options;
    saveFieldOptions(allOptions);
    res.json({ ok: true, options: allOptions[fieldName] });
  } catch (error) {
    console.error('保存字段选项失败:', error);
    res.status(500).json({ ok: false, message: '保存字段选项失败: ' + error.message });
  }
});

// 迁移用户数据到Supabase
async function migrateUserToSupabase() {
  try {
    // 检查是否已有用户数据
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (existingUsers && existingUsers.length === 0) {
      console.log('⚠️ 警告：Supabase用户表存在但无数据');
      console.log('请在Supabase控制台手动创建超级管理员账户:');
      console.log('');
      console.log('INSERT INTO public.users (id, account, password, name, role, status)');
      console.log("VALUES ('3c628e7c-a9f3-46f0-b27a-e07ab5d88be6', '10000', '123456', '超级管理员', '1', true);");
      console.log('');
      console.log('创建后即可使用账号: 10000, 密码: 123456 登录系统');
    }
  } catch (error) {
    console.error('迁移检查失败:', error);
  }
}

// 启动服务器
async function startServer() {
  // 初始化Supabase表
  const initSuccess = await initSupabaseTable();
  if (initSuccess) {
    // 迁移用户数据
    await migrateUserToSupabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`CRM API server running on http://0.0.0.0:${PORT}`);
      console.log(`可以通过 http://localhost:${PORT} 或内网IP:${PORT} 访问`);
    });
  } else {
    console.error('服务器启动失败：Supabase初始化失败');
  }
}

// 启动服务器
startServer();
