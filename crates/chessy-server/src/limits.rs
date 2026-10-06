//! A token bucket for per-connection message quotas.

use std::time::Instant;

/// What to do with the message just presented to a [`RateLimiter`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Allow,
    /// Over quota: ignore the message. `first` is set for the first drop of a
    /// streak, the one time the sender is told about it.
    Drop {
        first: bool,
    },
    /// Over quota for `flood_after` messages in a row: hang up.
    Disconnect,
}

/// Refills at `rate` tokens per second up to `burst`; a message costs tokens.
#[derive(Debug)]
pub struct RateLimiter {
    rate: f64,
    burst: f64,
    tokens: f64,
    last: Instant,
    /// Messages refused since the last accepted one.
    streak: u32,
}

impl RateLimiter {
    pub fn new(rate: f64, burst: u32, now: Instant) -> Self {
        RateLimiter {
            rate,
            burst: f64::from(burst),
            tokens: f64::from(burst),
            last: now,
            streak: 0,
        }
    }

    pub fn take(&mut self, cost: u32, now: Instant, flood_after: u32) -> Verdict {
        let elapsed = now.saturating_duration_since(self.last).as_secs_f64();
        self.last = now;
        self.tokens = (self.tokens + elapsed * self.rate).min(self.burst);
        let cost = f64::from(cost);
        if self.tokens >= cost {
            self.tokens -= cost;
            self.streak = 0;
            return Verdict::Allow;
        }
        self.streak = self.streak.saturating_add(1);
        if self.streak >= flood_after {
            Verdict::Disconnect
        } else {
            Verdict::Drop {
                first: self.streak == 1,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    #[test]
    fn bursts_then_refills() {
        let t0 = Instant::now();
        let mut l = RateLimiter::new(10.0, 3, t0);
        for _ in 0..3 {
            assert_eq!(l.take(1, t0, 5), Verdict::Allow);
        }
        assert_eq!(l.take(1, t0, 5), Verdict::Drop { first: true });
        assert_eq!(l.take(1, t0, 5), Verdict::Drop { first: false });
        let later = t0 + Duration::from_millis(250);
        assert_eq!(l.take(1, later, 5), Verdict::Allow, "2.5 tokens came back");
        assert_eq!(l.take(2, later, 5), Verdict::Drop { first: true });
    }

    #[test]
    fn a_long_streak_disconnects() {
        let t0 = Instant::now();
        let mut l = RateLimiter::new(1.0, 1, t0);
        assert_eq!(l.take(1, t0, 3), Verdict::Allow);
        assert!(matches!(l.take(1, t0, 3), Verdict::Drop { .. }));
        assert!(matches!(l.take(1, t0, 3), Verdict::Drop { .. }));
        assert_eq!(l.take(1, t0, 3), Verdict::Disconnect);
    }
}
