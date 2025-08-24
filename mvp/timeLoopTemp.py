# -*- coding: utf-8 -*-
"""
多项目射击训练计时 & 语音播报 & 实时终端UI
By ChatGPT (优化重构版)
"""
import json

import time
import threading
from datetime import datetime
from queue import Queue

import pyttsx3
from rich.live import Live
from rich.table import Table
from rich.console import Console


# ============ 基础配置区 ============

console = Console()


with open("config.json", "r", encoding="utf-8") as f:
    config = json.load(f)

training_plans = config["plans"]
prepare_time = config["prepare_time"]
ready_time = config["ready_time"]

# 语音播报
tts = pyttsx3.init()
tts_queue = Queue()
tts_lock = threading.Lock()  # 确保“第N枪准备-开始”独占播报
global_mute = threading.Lock()

# 实时状态存储
state_data = {}  # 每个项目单独状态
threads = []     # 存储所有项目线程


# ============ 通用输出 ============

def log(mode, text, speak=False):
    """日志输出+语音播报任务入队"""
    now = datetime.now().strftime("%H:%M:%S")
    # console.print(f"[{now}][{mode}] {text}")  # 可选打印
    if speak:
        tts_queue.put(f"{mode} {text}")


def wait(seconds, desc, mode=None):
    """倒计时等待，同时更新状态数据"""
    if mode:
        # 更新状态（不丢轮次）
        state_data[mode].update({
            "state": desc,
            "cur": 0,
            "total": seconds,
            "remaining_time": seconds
        })

    for sec in range(1, seconds + 1):
        if mode:
            state_data[mode]["cur"] = sec
            state_data[mode]["remaining_time"] = seconds - sec
        time.sleep(1)


# ============ 单项目训练流程 ============

def run_training(mode, plan):
    """每个项目独立训练逻辑"""

    total_rounds = plan["rounds"]
    hold_time = plan["hold_time"]
    rest_time = plan["rest_time"]

    wait(prepare_time, "训练准备", mode)

    for i in range(1, total_rounds + 1):
        state_data[mode]["remaining_rounds"] = total_rounds - i + 1

        with tts_lock:
            log(mode, f"第 {i} 枪准备", speak=True)
            time.sleep(ready_time)
            log(mode, "开始", speak=True)

        wait(hold_time, "举枪", mode)

        log(mode, "到", speak=True)
        wait(rest_time, "休息", mode)

    log(mode, "全部训练完成！", speak=True)

    state_data[mode].update({
        "state": "已完成",
        "cur": 0,
        "total": 0,
        "remaining_time": 0,
        "remaining_rounds": 0
    })


# ============ UI实时渲染 ============

def render_status():
    """渲染当前状态表格"""
    table = Table(title="训练状态")
    table.add_column("项目")
    table.add_column("状态")
    table.add_column("时间")
    table.add_column("剩余时间")
    table.add_column("剩余轮次")

    for mode, data in state_data.items():
        table.add_row(
            mode,
            data["state"],
            f'{data["cur"]}/{data["total"]}s',
            f'{data["remaining_time"]}s',
            f'{data["remaining_rounds"]}轮'
        )

    return table


def live_ui():
    """独立线程刷新UI"""
    with Live(render_status(), refresh_per_second=2, console=console) as live:
        while any(t.is_alive() for t in threads):
            live.update(render_status())
            time.sleep(1)


# ============ 主流程启动 ============

if __name__ == "__main__":
    # 初始化状态
    for mode, plan in training_plans.items():
        state_data[mode] = {
            "state": "等待开始",
            "cur": 0,
            "total": 0,
            "remaining_time": 0,
            "remaining_rounds": plan["rounds"]
        }

    log("", "训练开始", speak=True)

    # 启动各项目线程
    for mode, plan in training_plans.items():
        t = threading.Thread(target=run_training, args=(mode, plan))
        t.start()
        threads.append(t)

    # 启动UI线程
    threading.Thread(target=live_ui, daemon=True).start()

    # 主播报线程
    while True:
        try:
            text = tts_queue.get(timeout=0.5)
            tts.say(text)
            tts.runAndWait()
            tts_queue.task_done()
        except:
            if all(not t.is_alive() for t in threads) and tts_queue.empty():
                break

    log("SYSTEM", "所有训练已完成", speak=True)
