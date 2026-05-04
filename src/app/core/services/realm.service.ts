import { Injectable, signal, computed, effect } from '@angular/core';

export interface KnownRealm {
  id: string;
  name: string;
}

const REALMS_KEY       = 'aes_known_realms';
const ACTIVE_REALM_KEY = 'aes_active_realm';

const DEFAULT_REALMS: KnownRealm[] = [
  { id: '32', name: 'Realm 32 (Default)' },
];

@Injectable({ providedIn: 'root' })
export class RealmService {
  private _realms = signal<KnownRealm[]>(this.loadRealms());
  private _active = signal<string>( localStorage.getItem(ACTIVE_REALM_KEY) ?? '32' );
  readonly ALL_REALM = 'ALL';

  readonly realms  = computed(() => this._realms());
  readonly active  = computed(() => this._active());
  readonly isAll   = computed(() => this._active() === this.ALL_REALM);

  readonly activeRealm = computed<KnownRealm | null>(() => {
    if (this.isAll()) return null;
    return this._realms().find(r => r.id === this._active()) ?? null;
  });

  readonly activeLabel = computed(() => {
    if (this.isAll()) return 'All Realms';
    const r = this.activeRealm();
    return r ? r.name : `Realm ${this._active()}`;
  });

  constructor() {
    effect(() => {
      localStorage.setItem(ACTIVE_REALM_KEY, this._active());
    });
  }

  setActive(realmId: string): void {
    this._active.set(realmId);
  }

  setAll(): void {
    this._active.set(this.ALL_REALM);
  }

  addRealm(realm: KnownRealm): void {
    const exists = this._realms().some(r => r.id === realm.id);
    if (!exists) {
      this._realms.update(prev => [...prev, realm]);
      this.persistRealms();
    }
  }

  removeRealm(id: string): void {
    if (id === '32') return; // keep default
    this._realms.update(prev => prev.filter(r => r.id !== id));
    if (this._active() === id) this._active.set('32');
    this.persistRealms();
  }

  /** IDs of all realms, for multi-realm parallel fetches */
  realmIds(): string[] {
    return this._realms().map(r => r.id);
  }

  private loadRealms(): KnownRealm[] {
    try {
      const stored = localStorage.getItem(REALMS_KEY);
      if (!stored) return [...DEFAULT_REALMS];
      const parsed = JSON.parse(stored) as KnownRealm[];
      const has32 = parsed.some(r => r.id === '32');
      return has32 ? parsed : [DEFAULT_REALMS[0], ...parsed];
    } catch {
      return [...DEFAULT_REALMS];
    }
  }

  private persistRealms(): void {
    localStorage.setItem(REALMS_KEY, JSON.stringify(this._realms()));
  }
}
