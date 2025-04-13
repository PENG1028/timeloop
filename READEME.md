markdown
# TimeLoop 射击训练计时器

一个用于射击训练的多项目、多轮次计时与语音播报工具。  
支持多项目同时进行，自动播报口令，实时终端UI状态显示，适合个人或射击队日常训练使用。

---

## 特性 Features

- 多项目独立计时（如手枪、步枪等）
- 每组包含：
  - 准备时间
  - 举枪时间
  - 休息时间
- 自动语音播报（支持pyttsx3离线语音）
- 实时终端UI状态（基于 rich）
- 支持外部 config.json 配置管理
- 不同项目可同时并行训练
- 代码简单，易于扩展

---

## 安装依赖

```bash
pip install -r requirements.txt
```

或手动安装：

```bash
pip install pyttsx3 rich
```

---

## 使用方法

1. 修改配置文件
```bash
# 复制示例配置
cp config.json.example config.json
```

2. 编辑 config.json 内容
```json
{
  "plans": {
    "手枪": {
      "hold_time": 10,
      "rest_time": 10,
      "rounds": 5
    },
    "步枪": {
      "hold_time": 20,
      "rest_time": 20,
      "rounds": 5
    }
  },
  "prepare_time": 5,
  "ready_time": 3
}
```

---

3. 运行程序
```bash
python timeLoopTemp.py
```

---

## 效果展示

```
┏━━━━━━┳━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━┓
┃ 项目 ┃ 状态  ┃ 时间   ┃ 剩余时间┃ 剩余轮次┃
┡━━━━━━╇━━━━━━╇━━━━━━━━╇━━━━━━━━╇━━━━━━━━┩
│ 手枪 │ 举枪  │ 7/10s  │ 3s     │ 3轮    │
│ 步枪 │ 休息  │ 5/20s  │ 15s    │ 4轮    │
└──────┴──────┴────────┴────────┴────────┘
```


---

## 目录结构

```
TimeLoop/
├── timeLoopTemp.py          # 主程序
├── config.json.example      # 配置示例（需复制）
├── config.json              # 个人配置（git忽略）
├── requirements.txt         # 依赖库
├── .gitignore
└── LICENSE                  # 开源协议
```

---

## Todo

- [ ] 自动生成日志记录
- [ ] 自定义项目参数导入导出
- [ ] 可视化界面（web 或 app）
- [ ] 多语言播报支持
- [ ] 自动打包 .exe 或 .apk

---

## 作者

Made with curiosity & learning by [PENG1028](https://github.com/PENG1028)

---

## License

This project is licensed under the MIT License — feel free to use, modify, and share.