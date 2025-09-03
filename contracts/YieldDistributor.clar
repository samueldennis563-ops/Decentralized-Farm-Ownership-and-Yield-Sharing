;; YieldDistributor.clar
;; Contract for distributing yield earnings to token holders.
;; Integrates with oracles for yield data, calculates proportional shares,
;; handles claims, and includes governance for disputes.

;; Constants
(define-constant ERR-UNAUTHORIZED u200)
(define-constant ERR-PAUSED u201)
(define-constant ERR-NO-YIELD u202)
(define-constant ERR-ALREADY-CLAIMED u203)
(define-constant ERR-INVALID-FARM u204)
(define-constant ERR-INSUFFICIENT-FUNDS u205)
(define-constant ERR-ORACLE-NOT-TRUSTED u206)
(define-constant ERR-DISTRIBUTION-ACTIVE u207)
(define-constant MAX-DISTRIBUTION-PERIODS u10)

;; Data Variables
(define-data-var paused bool false)
(define-data-var admin principal tx-sender)
(define-data-var total-distributed uint u0)
(define-data-var distribution-active bool false)

;; Data Maps
(define-map yields uint {total-earnings: uint, period: uint, reported-by: principal, timestamp: uint})
(define-map claims {farm-id: uint, claimant: principal} {amount: uint, claimed: bool})
(define-map trusted-oracles principal bool)
(define-map farm-tokens uint principal) ;; Farm ID to token contract principal
(define-map distribution-history {farm-id: uint, period: uint} {earnings: uint, claimants: uint})
(define-map dispute-resolutions {farm-id: uint, period: uint} {resolved: bool, adjustment: int})
(define-map pending-distributions uint uint) ;; Farm ID to pending amount

;; Read-Only Functions
(define-read-only (get-yield (farm-id uint))
  (map-get? yields farm-id))

(define-read-only (get-claim (farm-id uint) (claimant principal))
  (map-get? claims {farm-id: farm-id, claimant: claimant}))

(define-read-only (is-trusted-oracle (oracle principal))
  (default-to false (map-get? trusted-oracles oracle)))

(define-read-only (get-distribution-history (farm-id uint) (period uint))
  (map-get? distribution-history {farm-id: farm-id, period: period}))

(define-read-only (get-dispute-resolution (farm-id uint) (period uint))
  (map-get? dispute-resolutions {farm-id: farm-id, period: period}))

(define-read-only (is-paused)
  (ok (var-get paused)))

(define-read-only (get-total-distributed)
  (ok (var-get total-distributed)))

;; Public Functions
(define-public (pause)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (var-set paused true)
    (ok true)))

(define-public (unpause)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (var-set paused false)
    (ok true)))

(define-public (add-trusted-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (map-set trusted-oracles oracle true)
    (ok true)))

(define-public (remove-trusted-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (map-delete trusted-oracles oracle)
    (ok true)))

(define-public (report-yield (farm-id uint) (total-earnings uint) (period uint))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-trusted-oracle tx-sender) (err ERR-ORACLE-NOT-TRUSTED))
    (asserts! (> total-earnings u0) (err ERR-NO-YIELD))
    (map-set yields farm-id {total-earnings: total-earnings, period: period, reported-by: tx-sender, timestamp: block-height})
    (map-set pending-distributions farm-id total-earnings)
    (ok true)))

(define-public (start-distribution (farm-id uint))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (asserts! (not (var-get distribution-active)) (err ERR-DISTRIBUTION-ACTIVE))
    (var-set distribution-active true)
    (ok true)))

(define-public (claim-dividends (farm-id uint))
  (let ((yield-data (unwrap! (map-get? yields farm-id) (err ERR-INVALID-FARM)))
        (token-contract (unwrap! (map-get? farm-tokens farm-id) (err ERR-INVALID-FARM)))
        (balance (as-contract (contract-call? token-contract get-balance tx-sender)))
        (total-supply (as-contract (contract-call? token-contract get-total-supply)))
        (share (/ (* (get total-earnings yield-data) (unwrap-panic balance)) (unwrap-panic total-supply)))
        (claim-entry (default-to {amount: u0, claimed: false} (map-get? claims {farm-id: farm-id, claimant: tx-sender}))))
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (not (get claimed claim-entry)) (err ERR-ALREADY-CLAIMED))
    (asserts! (> share u0) (err ERR-NO-YIELD))
    (try! (as-contract (stx-transfer? share tx-sender (as-contract tx-sender)))) ;; Mock transfer, assume funds escrowed
    (map-set claims {farm-id: farm-id, claimant: tx-sender} {amount: share, claimed: true})
    (var-set total-distributed (+ (var-get total-distributed) share))
    (ok share)))

(define-public (end-distribution (farm-id uint) (period uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (asserts! (var-get distribution-active) (err ERR-NO-YIELD))
    (var-set distribution-active false)
    (map-set distribution-history {farm-id: farm-id, period: period} {earnings: (default-to u0 (map-get? pending-distributions farm-id)), claimants: u0}) ;; Update claimants separately
    (map-delete pending-distributions farm-id)
    (ok true)))

(define-public (resolve-dispute (farm-id uint) (period uint) (adjustment int))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (map-set dispute-resolutions {farm-id: farm-id, period: period} {resolved: true, adjustment: adjustment})
    (ok true)))

;; Private Functions for calculations
(define-private (calculate-share (balance uint) (total-earnings uint) (total-supply uint))
  (/ (* total-earnings balance) total-supply))

;; Additional features: batch claims, etc.
(define-public (batch-claim (farm-ids (list 10 uint)))
  (fold batch-claim-iter farm-ids (ok u0)))

(define-private (batch-claim-iter (farm-id uint) (previous (response uint uint)))
  (match previous
    success (let ((claim-amount (unwrap! (claim-dividends farm-id) (err ERR-INVALID-FARM))))
              (ok (+ success claim-amount)))
    error (err error)))