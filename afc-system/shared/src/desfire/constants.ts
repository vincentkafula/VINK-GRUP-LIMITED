/** MIFARE DESFire native commands (wrapped in ISO 7816-4 as CLA 0x90). */
export const CMD = {
  AUTH_AES: 0xaa,
  ADDITIONAL_FRAME: 0xaf,
  SELECT_APP: 0x5a,
  CREATE_APP: 0xca,
  DELETE_APP: 0xda,
  FORMAT_PICC: 0xfc,
  CHANGE_KEY: 0xc4,
  GET_KEY_VERSION: 0x64,
  CREATE_STD_FILE: 0xcd,
  CREATE_BACKUP_FILE: 0xcb,
  CREATE_VALUE_FILE: 0xcc,
  READ_DATA: 0xbd,
  WRITE_DATA: 0x3d,
  GET_VALUE: 0x6c,
  CREDIT: 0x0c,
  DEBIT: 0xdc,
  COMMIT: 0xc7,
  ABORT: 0xa7,
} as const;

/** Status byte (SW2) after SW1 = 0x91. */
export const STATUS = {
  OK: 0x00,
  NO_CHANGES: 0x0c,
  ILLEGAL_COMMAND: 0x1c,
  INTEGRITY_ERROR: 0x1e,
  NO_SUCH_KEY: 0x40,
  LENGTH_ERROR: 0x7e,
  PERMISSION_DENIED: 0x9d,
  PARAMETER_ERROR: 0x9e,
  APPLICATION_NOT_FOUND: 0xa0,
  AUTHENTICATION_ERROR: 0xae,
  ADDITIONAL_FRAME: 0xaf,
  BOUNDARY_ERROR: 0xbe,
  COMMAND_ABORTED: 0xca,
  DUPLICATE_ERROR: 0xde,
  FILE_NOT_FOUND: 0xf0,
} as const;

export const STATUS_NAME: Record<number, string> = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k]));

/** Communication modes of a file. Fare files use MACed: every write is authenticated and every response is integrity checked. */
export const COMM = { PLAIN: 0x00, MACED: 0x01, ENCIPHERED: 0x03 } as const;

/** Access-right nibble values. */
export const ACCESS = { FREE: 0xe, DENY: 0xf } as const;

export const NO_APPLICATION = Buffer.from([0, 0, 0]);
