;; FarmToken.clar
;; SIP-10 Compliant Fungible Token for Farm Shares
;; This contract represents fractional ownership shares in a farm.
;; It includes minting for initial offerings, transfers, burning for redemptions,
;; admin controls for pausing, and metadata for token details.

;; Constants
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-PAUSED u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-INVALID-RECIPIENT u103)
(define-constant ERR-INVALID-MINTER u104)
(define-constant ERR-ALREADY-REGISTERED u105)
(define-constant ERR-METADATA-TOO-LONG u106)
(define-constant ERR-INSUFFICIENT-BALANCE u107)
(define-constant ERR-INVALID-FARM-ID u108)
(define-constant ERR-TOKEN-LOCKED u109)
(define-constant MAX-METADATA-LEN u500)

;; Data Variables
(define-data-var token-name (string-ascii 32) "FarmShareToken")
(define-data-var token-symbol (string-ascii 8) "FST")
(define-data-var token-decimals uint u6)
(define-data-var total-supply uint u0)
(define-data-var paused bool false)
(define-data-var admin principal tx-sender)

;; Data Maps
(define-map balances principal uint)
(define-map minters principal bool)
(define-map allowances {owner: principal, spender: principal} uint)
(define-map token-metadata uint (string-utf8 256)) ;; Farm-specific metadata by token ID if needed
(define-map locked-tokens {owner: principal, farm-id: uint} {amount: uint, unlock-block: uint})
(define-map farm-associations uint principal) ;; Farm ID to token contract, but since per farm, maybe per instance

;; Traits
;; Implements SIP-10 Fungible Token Standard

;; Read-Only Functions
(define-read-only (get-name)
  (ok (var-get token-name)))

(define-read-only (get-symbol)
  (ok (var-get token-symbol)))

(define-read-only (get-decimals)
  (ok (var-get token-decimals)))

(define-read-only (get-total-supply)
  (ok (var-get total-supply)))

(define-read-only (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account))))

(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances {owner: owner, spender: spender}))))

(define-read-only (is-minter (account principal))
  (ok (default-to false (map-get? minters account))))

(define-read-only (is-paused)
  (ok (var-get paused)))

(define-read-only (get-admin)
  (ok (var-get admin)))

(define-read-only (get-token-metadata (token-id uint))
  (map-get? token-metadata token-id))

(define-read-only (get-locked-balance (owner principal) (farm-id uint))
  (ok (get amount (default-to {amount: u0, unlock-block: u0} (map-get? locked-tokens {owner: owner, farm-id: farm-id})))))

;; Public Functions
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)))

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

(define-public (add-minter (minter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (asserts! (is-none (map-get? minters minter)) (err ERR-ALREADY-REGISTERED))
    (map-set minters minter true)
    (ok true)))

(define-public (remove-minter (minter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (map-set minters minter false)
    (ok true)))

(define-public (mint (amount uint) (recipient principal) (metadata (string-utf8 256)))
  (let ((current-supply (var-get total-supply)))
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (unwrap-panic (is-minter tx-sender)) (err ERR-INVALID-MINTER))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-eq recipient (as-contract tx-sender))) (err ERR-INVALID-RECIPIENT)) ;; Avoid self-mint issues
    (asserts! (<= (len metadata) MAX-METADATA-LEN) (err ERR-METADATA-TOO-LONG))
    (map-set balances recipient (+ (unwrap-panic (get-balance recipient)) amount))
    (var-set total-supply (+ current-supply amount))
    ;; Optionally set metadata for batch, but for simplicity, assume per mint call
    (ok true)))

(define-public (transfer (amount uint) (sender principal) (recipient principal))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-eq tx-sender sender) (err ERR-UNAUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (>= (unwrap-panic (get-balance sender)) amount) (err ERR-INSUFFICIENT-BALANCE))
    (map-set balances sender (- (unwrap-panic (get-balance sender)) amount))
    (map-set balances recipient (+ (unwrap-panic (get-balance recipient)) amount))
    (ok true)))

(define-public (approve (spender principal) (amount uint))
  (begin
    (map-set allowances {owner: tx-sender, spender: spender} amount)
    (ok true)))

(define-public (transfer-from (owner principal) (recipient principal) (amount uint))
  (let ((allowance (unwrap-panic (get-allowance owner tx-sender))))
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (>= allowance amount) (err ERR-UNAUTHORIZED))
    (asserts! (>= (unwrap-panic (get-balance owner)) amount) (err ERR-INSUFFICIENT-BALANCE))
    (map-set allowances {owner: owner, spender: tx-sender} (- allowance amount))
    (map-set balances owner (- (unwrap-panic (get-balance owner)) amount))
    (map-set balances recipient (+ (unwrap-panic (get-balance recipient)) amount))
    (ok true)))

(define-public (burn (amount uint))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (>= (unwrap-panic (get-balance tx-sender)) amount) (err ERR-INSUFFICIENT-BALANCE))
    (map-set balances tx-sender (- (unwrap-panic (get-balance tx-sender)) amount))
    (var-set total-supply (- (var-get total-supply) amount))
    (ok true)))

(define-public (lock-tokens (farm-id uint) (amount uint) (unlock-block uint))
  (begin
    (asserts! (>= (unwrap-panic (get-balance tx-sender)) amount) (err ERR-INSUFFICIENT-BALANCE))
    (asserts! (> unlock-block block-height) (err ERR-INVALID-AMOUNT)) ;; Unlock in future
    (map-set locked-tokens {owner: tx-sender, farm-id: farm-id} {amount: amount, unlock-block: unlock-block})
    (map-set balances tx-sender (- (unwrap-panic (get-balance tx-sender)) amount))
    (ok true)))

(define-public (unlock-tokens (farm-id uint))
  (let ((locked (unwrap-panic (get-locked-balance tx-sender farm-id))))
    (asserts! (>= block-height (get unlock-block locked)) (err ERR-TOKEN-LOCKED))
    (map-set balances tx-sender (+ (unwrap-panic (get-balance tx-sender)) (get amount locked)))
    (map-delete locked-tokens {owner: tx-sender, farm-id: farm-id})
    (ok true)))

;; Additional sophisticated features: batch mint, batch transfer, etc.
(define-public (batch-mint (recipients (list 100 {recipient: principal, amount: uint, metadata: (string-utf8 256)})))
  (fold batch-mint-iter recipients (ok u0)))

(define-private (batch-mint-iter (entry {recipient: principal, amount: uint, metadata: (string-utf8 256)}) (previous (response uint uint)))
  (match previous
    success (let ((recipient (get recipient entry)))
              (try! (mint (get amount entry) recipient (get metadata entry)))
              (ok (+ success (get amount entry))))
    error (err error)))

;;