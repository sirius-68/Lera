import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { CONCEPTS } from '@core/engine/concepts';
import { levelOf, totalXp } from '@core/store/game';
import { learnerModel } from '@core/store/insights';
import { byDay, confidence, insights, statusOf, streak } from '@core/store/learner';
import type { AttemptRecord } from '@core/store/types';
import { weaknesses } from '@core/store/weakness';
import { go, openOverlay, useApp } from '../host/link';
import { Lera } from '../mascot/Lera';
import { Bar, Button3D, Chip, CountUp, Dot, Icon, Label, prettyMath, Raised, Rich, row, T } from '../ui/kit';
import { C, FONT, SPRING } from '../ui/theme';
import { Card, IconBtn, Rise, RowBtn, TopBar, WeakCard } from './parts';

const MATH_FONT = Platform.select({ ios: 'Times New Roman', default: 'serif' });

function SigBar({ h, color, delay }: { h: number; color: string; delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withSpring(1, SPRING));
  }, [v, delay]);
  const style = useAnimatedStyle(() => ({ height: `${Math.max(3, h * 100 * v.value)}%` }));
  return <Animated.View style={[{ flex: 1, minHeight: 3, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: color }, style]} />;
}

/** Marks per day over the last ten days of practice. */
function Signature({ attempts }: { attempts: AttemptRecord[] }) {
  const days = byDay(attempts).slice(-10);
  const max = Math.max(1, ...days.map((d) => d.gaps + d.slips));
  if (days.length === 0) return null;
  return (
    <View accessibilityLabel={`Marks per day over the last ${days.length} days of practice`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 104, marginTop: 12, marginBottom: 10 }}>
      {days.map((d, i) => (
        <View key={d.day} style={{ flex: 1, maxWidth: 34, height: '100%', alignItems: 'center', gap: 4 }}>
          <View style={{ flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-end', gap: 3, borderBottomWidth: 1.5, borderColor: C.line }}>
            <SigBar h={d.gaps / max} color={C.gap} delay={i * 50} />
            <SigBar h={d.slips / max} color="#f0b63e" delay={i * 50 + 25} />
          </View>
          <T w={600} s={11} c={C.ink3}>{d.day.slice(8)}</T>
        </View>
      ))}
    </View>
  );
}

const Fact = ({ icon, children }: { icon: string; children: ReactNode }) => (
  <View style={[row(10), { alignItems: 'flex-start' }]}>
    <View style={{ marginTop: 3 }}><Icon name={icon} size={16} color={C.brand} /></View>
    <T s={14.5} lh={21} style={{ flex: 1 }}>{children}</T>
  </View>
);
const B = ({ children }: { children: ReactNode }) => <T w={700} s={14.5} lh={21}>{children}</T>;

const INSIGHT = { gap: [C.gapBg, C.gap, 'target'], slip: [C.slipBg, C.slip, 'eye'], strategy: [C.tint, C.brand, 'swap'], ok: [C.okBg, C.ok, 'sparkle'] } as const;

export function ProgressScreen() {
  const attempts = useApp((s) => s.attempts);
  const concepts = useApp((s) => s.concepts);
  const docs = useApp((s) => s.docs);
  const read = useApp((s) => s.read);
  const understood = useApp((s) => s.understood);
  const profile = useApp((s) => s.profile);
  const events = useApp((s) => s.events);
  const [openId, setOpenId] = useState<string | null>(null);
  const [allWeak, setAllWeak] = useState(false);
  const days = streak(attempts);
  const solved = attempts.filter((a) => a.verdict === 'solved').length;
  const clean = attempts.filter((a) => a.verdict === 'solved' && a.marks.length === 0 && a.hintRung < 3).length;
  const notes = useMemo(() => insights({ attempts, concepts }), [attempts, concepts]);
  const weak = useMemo(() => weaknesses({ attempts, concepts, docs, understood }), [attempts, concepts, docs, understood]);
  const known = Object.values(concepts).filter((c) => !!c);
  const order = { gap: 0, shaky: 1, solid: 2, new: 3 } as const;
  const sorted = [...known].sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
  const approaches = new Map<string, number>();
  attempts.forEach((a) => a.approach && approaches.set(a.approach, (approaches.get(a.approach) ?? 0) + 1));
  const topApproaches = [...approaches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const totalApproach = topApproaches.reduce((s, [, n]) => s + n, 0);
  const gaps = attempts.reduce((s, a) => s + a.marks.filter((m) => m.severity === 'gap').length, 0);
  const slips = attempts.reduce((s, a) => s + a.marks.filter((m) => m.severity === 'slip').length, 0);
  const xp = totalXp({ attempts, read });
  const lv = levelOf(xp);
  const model = useMemo(() => learnerModel({ attempts, concepts, profile, events, read }), [attempts, concepts, profile, events, read]);
  let i = 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <TopBar title="Progress"><IconBtn name="gear" label="Settings" onPress={() => go({ name: 'settings' })} /></TopBar>
      {attempts.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', gap: 14, paddingVertical: 60, paddingHorizontal: 30 }}>
          <Lera size={104} mood="curious" />
          <T w={700} s={21} center>Nothing to analyse yet</T>
          <T c={C.ink2} lh={22} center>Solve a few problems and this page fills in: where your working breaks, which ideas are shaky, and what to review.</T>
          <Button3D onPress={() => go({ name: 'practice' })}>Go to Practice</Button3D>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 20, paddingBottom: 26, gap: 16 }}>
          {model.evidence !== 'none' && (
            <Rise i={i++}>
              <Card style={{ gap: 10 }}>
                <Label>How you learn</Label>
                {model.habits.usualTime && <Fact icon="clock">You mostly practise in the <B>{model.habits.usualTime}</B>{model.habits.usualHour !== null ? `, around ${model.habits.usualHour}:00` : ''}.</Fact>}
                {model.skill.pace !== null && <Fact icon="bolt">About <B>{model.skill.pace < 90 ? `${Math.round(model.skill.pace)} seconds` : `${Math.round(model.skill.pace / 60)} minutes`}</B> a problem, <B>{Math.round(model.skill.cleanRate * 100)}%</B> clean lately{model.skill.trend > 0.05 ? ', and improving' : model.skill.trend < -0.05 ? ', a little down' : ''}.</Fact>}
                {model.style.mistakes !== 'few' && (
                  <Fact icon="target">
                    {model.style.mistakes === 'careless' ? <>Your mistakes are mostly <B>slips</B>: you know the rule and lose a sign or a number. One more check per line fixes most of them.</> : model.style.mistakes === 'conceptual' ? <>Your mistakes are mostly <B>gaps</B>: a rule that isn’t there yet. Reviews matter more than extra problems.</> : <>A mix of <B>slips and gaps</B>. I’ll keep bringing the gaps back.</>}
                  </Fact>
                )}
                {model.topErrors[0] && <Fact icon="refresh">Most repeated: <B>{model.topErrors[0].title}</B> ({model.topErrors[0].count} times).</Fact>}
                {model.style.hintReliance > 0.4 && <Fact icon="bulb">You take a hint on <B>{Math.round(model.style.hintReliance * 100)}%</B> of problems. Try the first line alone before asking.</Fact>}
                <T s={12.5} c={C.ink3}>Worked out on this phone from your own working.</T>
              </Card>
            </Rise>
          )}

          <Rise i={i++}>
            <Raised onPress={() => go({ name: 'streak' })} edge={C.flameD} depth={4}>
              <LinearGradient colors={['#ffbf3b', C.flame]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[row(14), { padding: 14, borderRadius: 22 }]}>
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}><T w={800} s={26} c="#fff">{lv.level}</T></View>
                <View style={{ flex: 1 }}>
                  <T w={700} s={17} c="#fff">{lv.title}</T>
                  <View style={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 6, marginBottom: 5, overflow: 'hidden' }}>
                    <View style={{ height: 8, minWidth: 6, borderRadius: 999, backgroundColor: '#fff', width: `${(lv.into / lv.need) * 100}%` }} />
                  </View>
                  <View style={row(4)}><CountUp to={xp} s={12.5} c="#fff" /><T s={12.5} c="#fff">XP · {lv.need - lv.into} to level {lv.level + 1}</T></View>
                </View>
                <Icon name="chevron" size={18} color="#fff" />
              </LinearGradient>
            </Raised>
          </Rise>

          <Rise i={i++} style={{ flexDirection: 'row', gap: 10 }}>
            {[[days, '', 'day streak'], [solved, '', 'solved'], [solved ? Math.round((clean / solved) * 100) : 0, '%', 'clean']].map(([n, suffix, label]) => (
              <View key={label as string} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.tint }}>
                <CountUp to={n as number} suffix={suffix as string} w={700} s={24} lh={28} c={C.brandD} />
                <T w={500} s={12.5} c={C.ink2}>{label}</T>
              </View>
            ))}
          </Rise>

          {weak.length > 0 && (
            <Rise i={i++} style={{ gap: 10 }}>
              <View style={[row(), { justifyContent: 'space-between' }]}>
                <Label>Weak spots · {weak.length}</Label>
                <T s={12.5} c={C.ink3}>most useful first</T>
              </View>
              {(allWeak ? weak : weak.slice(0, 3)).map((w) => <WeakCard key={w.id} w={w} />)}
              {weak.length > 3 && (
                <Pressable onPress={() => setAllWeak(!allWeak)} style={{ alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 12 }}>
                  <T w={600} c={C.brand}>{allWeak ? 'Show fewer' : `Show all ${weak.length}`}</T>
                </Pressable>
              )}
            </Rise>
          )}

          <Rise i={i++}>
            <Card>
              <View style={[row(), { justifyContent: 'space-between' }]}>
                <Label>Your error signature</Label>
                <View style={row(10)}>
                  <View style={row(4)}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: C.gap }} /><T s={12.5}>Gaps {gaps}</T></View>
                  <View style={row(4)}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#f0b63e' }} /><T s={12.5}>Slips {slips}</T></View>
                </View>
              </View>
              <Signature attempts={attempts} />
              <Rich text="A **gap** is a rule you don’t have yet, it gets a review. A **slip** is a rule you have but fumbled, it just gets noticed." s={13.5} lh={20} c={C.ink2} bold={C.ink2} />
            </Card>
          </Rise>

          {notes.length > 0 && (
            <Rise i={i++} style={{ gap: 8 }}>
              <Label>How you work</Label>
              {notes.map((n, k) => {
                const look = INSIGHT[n.tone as keyof typeof INSIGHT] ?? INSIGHT.strategy;
                return (
                  <View key={k} style={[row(10), { alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: look[0] }]}>
                    <View style={{ marginTop: 2 }}><Icon name={look[2]} size={18} color={look[1]} /></View>
                    <Rich text={n.text} s={14.5} lh={22} style={{ flex: 1 }} />
                  </View>
                );
              })}
            </Rise>
          )}

          {sorted.length > 0 && (
            <Rise i={i++}>
              <Label>Knowledge map</Label>
              <View style={{ marginTop: 8 }}>
                {sorted.map((c) => {
                  const st = statusOf(c);
                  return (
                    <RowBtn key={c.id} border onPress={() => openOverlay({ name: 'review', concept: c.id })}>
                      <Dot status={st} />
                      <View style={{ flex: 1, marginLeft: 2 }}>
                        <T w={700} s={14.5} style={{ marginBottom: 6 }}>{CONCEPTS[c.id].title}</T>
                        <Bar value={confidence(c)} tone={`thin ${st === 'solid' ? 'ok' : ''}`} />
                      </View>
                      <T s={12.5} c={C.ink3} style={{ minWidth: 64, textAlign: 'right' }}>{c.gaps ? `${c.gaps} gap${c.gaps > 1 ? 's' : ''}` : c.slips ? `${c.slips} slip${c.slips > 1 ? 's' : ''}` : `${c.clean} clean`}</T>
                    </RowBtn>
                  );
                })}
              </View>
            </Rise>
          )}

          {topApproaches.length > 0 && (
            <Rise i={i++}>
              <Card>
                <Label>How you approach problems</Label>
                <View style={{ gap: 10, marginTop: 10 }}>
                  {topApproaches.map(([name, n]) => (
                    <View key={name}>
                      <View style={[row(), { justifyContent: 'space-between', marginBottom: 4 }]}>
                        <T s={14} style={{ textTransform: 'capitalize' }}>{name}</T>
                        <T s={14} c={C.ink3}>{n}</T>
                      </View>
                      <Bar value={n / totalApproach} tone="thin" />
                    </View>
                  ))}
                </View>
              </Card>
            </Rise>
          )}

          <Rise i={i++} style={{ gap: 8 }}>
            <Label>Recent working</Label>
            {[...attempts].reverse().slice(0, 12).map((a) => (
              <Card key={a.id} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                <Pressable accessibilityState={{ expanded: openId === a.id }} onPress={() => setOpenId(openId === a.id ? null : a.id)} style={row()}>
                  <Dot status={a.verdict === 'solved' ? (a.marks.length ? 'shaky' : 'solid') : 'gap'} />
                  <T s={15.5} style={{ flex: 1, fontFamily: MATH_FONT }} numberOfLines={2}>{prettyMath(a.given || a.prompt)}</T>
                  <T s={12.5} c={C.ink3}>{a.day.slice(5)}</T>
                  <Icon name={openId === a.id ? 'down' : 'chevron'} size={16} />
                </Pressable>
                {openId === a.id && (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {a.lines.map((l, k) => {
                      const good = l.status === 'ok' || l.status === 'recovered';
                      const bad = l.status === 'wrong';
                      return (
                        <View key={k} style={[row(10), { paddingVertical: 5 }]}>
                          <T w={600} s={12.5} c={C.ink3} style={{ width: 20, textAlign: 'right' }}>{k + 1}</T>
                          <T s={16} style={{ flex: 1, fontFamily: MATH_FONT }}>{prettyMath(l.text)}</T>
                          <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: good ? C.ok : bad ? (l.severity === 'slip' ? C.slip : C.gap) : 'transparent' }}>
                            {good && <Icon name="check" size={13} stroke={3.4} color="#fff" />}
                            {bad && <T w={800} s={12} lh={14} c="#fff">!</T>}
                          </View>
                        </View>
                      );
                    })}
                    {a.marks.map((m, k) => (
                      <View key={`m${k}`} style={[row(6), { alignItems: 'flex-start', paddingTop: 4, paddingLeft: 30 }]}>
                        <Chip tone={m.severity === 'gap' ? 'gap' : 'slip'}>Line {m.line + 1}</Chip>
                        <Rich text={m.title} s={13.5} c={C.ink2} style={{ flex: 1, marginTop: 4 }} />
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            ))}
          </Rise>
        </ScrollView>
      )}
    </View>
  );
}
void FONT;
