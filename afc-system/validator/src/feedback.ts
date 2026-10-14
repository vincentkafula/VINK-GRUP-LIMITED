import { spawn } from "node:child_process";
import type { Feedback } from "@afc/shared";

export type { Feedback };

/** Green light and one beep for success; red light and two beeps for a refusal. `console` is for development; `gpio` drives a buzzer and a red/green LED on a Raspberry Pi. */
export class ConsoleFeedback implements Feedback {
  lines: string[] = [];
  constructor(private readonly out: (s: string) => void = (s) => console.log(s), private readonly colour = process.stdout.isTTY) {}
  private say(kind: "OK " | "NO ", msg: string, c: string) { const line = `${kind} ${msg}`; this.lines.push(line); this.out(this.colour ? `\x1b[${c}m${line}\x1b[0m` : line); }
  success(m: string) { this.say("OK ", m, "32"); }
  fail(m: string) { this.say("NO ", m, "31"); }
  busy() { /* nothing to show */ }
}

/**
 * Raspberry Pi: green LED, red LED and buzzer on GPIO lines, driven with the `gpioset` tool from libgpiod v2 (apt install gpiod).
 * Wiring (BCM numbers, change in the environment): GPIO17 = green LED, GPIO27 = red LED, GPIO22 = buzzer (active, through a transistor),
 * each LED through a 330 ohm resistor to ground. Not exercised on hardware in this repository: test it on the bench first.
 */
export class GpioFeedback implements Feedback {
  constructor(private readonly pins = { green: Number(process.env.GPIO_GREEN ?? 17), red: Number(process.env.GPIO_RED ?? 27), buzzer: Number(process.env.GPIO_BUZZER ?? 22) }, private readonly chip = process.env.GPIO_CHIP ?? "gpiochip0") {}
  private set(pin: number, on: boolean) {
    const p = spawn("gpioset", ["-c", this.chip, `${pin}=${on ? 1 : 0}`], { stdio: "ignore" });
    p.on("error", () => { /* gpiod tools not installed: the console message below still tells the story */ });
    return p;
  }
  private async pulse(pin: number, ms: number) { this.set(pin, true); await new Promise((r) => setTimeout(r, ms)); this.set(pin, false); }
  private async beeps(n: number) { for (let i = 0; i < n; i++) { await this.pulse(this.pins.buzzer, 120); await new Promise((r) => setTimeout(r, 90)); } }
  success(m: string) { console.log("OK ", m); void Promise.all([this.pulse(this.pins.green, 900), this.beeps(1)]); }
  fail(m: string) { console.log("NO ", m); void Promise.all([this.pulse(this.pins.red, 1200), this.beeps(2)]); }
  busy() { /* the amber state is "no light yet" */ }
}
