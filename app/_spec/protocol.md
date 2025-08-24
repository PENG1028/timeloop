指令（命令）（给计时内核发）：

Start(flowId, payload)：开始某流程

Pause(flowId) / Resume(flowId) / Stop(flowId)

NextUnit(flowId) / NextRound(flowId)

AdjustTime(flowId, scope, {deltaSec|setSec})

AdjustVoice(flowId, scope, {onStart?, onEnd?, markers?, sayNow?})

SetMode(mode: "queue"|"ducking"|"interrupt")

GlobalMute(durationMs?) / GlobalUnmute()

事件（内核往外发）：

PhaseEnter {flowId, unitIndex, roundIndex, endsAt}

Tick {flowId, remainingMs, phaseIndex}

SpeakPlan {id, at, priority, text, kind("tts"|"cached"|"beep")}

SpeakStart/End {id, at}

AdjustApplied {flowId, type, scope, old, new}

DelayBadge {flowId, delayMs}