# Anime.js v4 Core

**CRITICAL: v4 syntax only. Never use v3.**

## v4 Import (Required)

```javascript
// CORRECT
import { animate, createTimeline, stagger, utils, eases, engine } from 'animejs';

// WRONG - v3
// import anime from 'animejs';
```

## Time Unit Setup (Once in App Entry)

```javascript
// Set ONCE in main entry point (App.js, index.js)
import { engine } from 'animejs';
engine.timeUnit = 's';  // 1 = 1 second
```

## Basic Animation

Single line for simple tweens (<=4 properties):
```javascript
animate('.element', { x: 250, duration: 1, ease: 'outQuad' });
animate('.element', { opacity: [0, 1], y: [20, 0], duration: 0.6, ease: 'outQuad' });
animate('.element', { scale: [0, 1], duration: 0.8, ease: 'outElastic(1, 0.5)' });
animate('.element', { rotate: 360, duration: 2, loop: true, ease: 'linear' });
```

## Timeline

```javascript
const tl = createTimeline({ defaults: { duration: 1, ease: 'outQuad' } });

tl.add('.element1', { x: 250 })
  .add('.element2', { y: 100 }, '+=0.2')  // 0.2s after previous
  .add('.element3', { rotate: 180 }, '<'); // at start of previous
```

## Stagger

```javascript
animate('.elements', { x: 250, delay: stagger(0.1) });
animate('.elements', { x: 250, delay: stagger(0.1, { from: 'center' }) });
```

## v3 to v4 Migration

| v3 | v4 |
|----|-----|
| `anime({ targets: '.el' })` | `animate('.el', { })` |
| `anime.timeline()` | `createTimeline()` |
| `{ easing: 'easeInOutQuad' }` | `{ ease: 'inOutQuad' }` |
| `{ value: 250 }` | `{ to: 250 }` |
| `{ direction: 'alternate' }` | `{ alternate: true }` |
| `{ complete: fn }` | `{ onComplete: fn }` |

## Easing

```javascript
{ ease: 'inOutQuad' }
{ ease: 'outElastic(1, 0.5)' }
{ ease: 'cubicBezier(0.4, 0, 0.2, 1)' }
```

## Direction & Looping

```javascript
{
  loop: true,        // infinite
  loop: 3,          // 3 times
  alternate: true,   // alternate direction
  reversed: true     // play reverse
}
```

## Callbacks

```javascript
// Simple - one line
animate('.element', { x: 250, duration: 1, onComplete: () => console.log('Done!') });

// Multiple
animate('.element', {
  x: 250,
  onBegin: (anim) => console.log('Started'),
  onUpdate: (anim) => console.log(anim.progress),
  onComplete: (anim) => console.log('Finished')
});
```

## Common Patterns

### Hover
```javascript
el.addEventListener('mouseenter', () => animate(el, { scale: 1.1, duration: 0.3, ease: 'outQuad' }));
el.addEventListener('mouseleave', () => animate(el, { scale: 1, duration: 0.3, ease: 'outQuad' }));
```

### Fade In
```javascript
animate('.element', { opacity: [0, 1], y: [20, 0], duration: 0.6, ease: 'outQuad' });
```

### Bounce
```javascript
animate('.element', { scale: [0, 1], duration: 0.8, ease: 'outElastic(1, 0.5)' });
```

## Validation Checklist

- [ ] Using `import { animate } from 'animejs'`
- [ ] `engine.timeUnit = 's'` ONCE in entry point
- [ ] Using seconds (1 = 1 second)
- [ ] Simple animations ONE LINE
- [ ] Using `ease:` not `easing:`
- [ ] Using `to:` not `value:`
- [ ] Callbacks prefixed with `on`
- [ ] Using `loop`/`alternate` not `direction`
