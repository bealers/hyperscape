/**
 * Nametag.ts - Player/NPC Name Label
 *
 * Displays character names above entities with optional combat level.
 * OSRS format: "Name (level-XX)"
 *
 * IMPORTANT: Health bars are now handled separately by the HealthBars system.
 * This node ONLY handles name display.
 *
 * @see HealthBar node for health bar display
 * @see HealthBars system for the rendering system
 */

import type {
  Nametags as NametagsSystem,
  NametagHandle,
} from "../systems/client/Nametags";
import type { NametagData } from "../types/rendering/nodes";
import { Node } from "./Node";

const defaults = {
  label: "...",
  level: null as number | null,
};

/**
 * Nametag Node - Frontend handle for the Nametags system
 *
 * Provides a clean API for entities to manage their name label and combat level.
 * Health bars are handled separately by the HealthBar node/HealthBars system.
 */
export class Nametag extends Node {
  handle: NametagHandle | null = null;

  private _label: string = defaults.label;
  private _level: number | null = defaults.level;

  constructor(data: NametagData = {}) {
    super(data);
    this.name = "nametag";

    if (data.label !== undefined) {
      this._label = String(data.label);
    }
    if (data.level !== undefined) {
      this._level = data.level;
    }
  }

  mount() {
    // Prevent multiple mounts - if we already have a handle, destroy it first
    if (this.handle) {
      this.handle.destroy();
      this.handle = null;
    }

    // Find Nametags system
    const nametags = this.ctx?.systems.find(
      (s) =>
        (s as { systemName?: string }).systemName === "nametags" ||
        s.constructor.name === "Nametags",
    ) as NametagsSystem | undefined;

    if (nametags) {
      this.handle = nametags.add({ name: this._label, level: this._level });
      if (this.handle) {
        this.handle.move(this.matrixWorld);
      }
    }
  }

  commit(didMove: boolean) {
    if (didMove && this.handle) {
      this.handle.move(this.matrixWorld);
    }
  }

  unmount() {
    if (this.handle) {
      this.handle.destroy();
      this.handle = null;
    }
  }

  copy(source: Nametag, recursive: boolean) {
    super.copy(source, recursive);
    this._label = source._label;
    this._level = source._level;
    return this;
  }

  get label(): string {
    return this._label;
  }

  set label(value: string | undefined) {
    const newValue = value !== undefined ? String(value) : defaults.label;
    if (this._label === newValue) return;
    this._label = newValue;
    this.handle?.setName(newValue);
  }

  /** Combat level (null = don't display) */
  get level(): number | null {
    return this._level;
  }

  /** Set combat level for OSRS-style display: "Name (level-XX)" */
  set level(value: number | null | undefined) {
    const newValue = value !== undefined ? value : defaults.level;
    if (this._level === newValue) return;
    this._level = newValue;
    this.handle?.setLevel(newValue);
  }

  getProxy() {
    const self = this;
    if (!this.proxy) {
      let proxy = {
        get label() {
          return self.label;
        },
        set label(value: string) {
          self.label = value;
        },
        get level() {
          return self.level;
        },
        set level(value: number | null) {
          self.level = value;
        },
      };
      proxy = Object.defineProperties(
        proxy,
        Object.getOwnPropertyDescriptors(super.getProxy()),
      );
      this.proxy = proxy;
    }
    return this.proxy;
  }
}
