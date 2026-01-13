#include <SPI.h>
#include <MFRC522.h>

#define RST_PIN 9
#define SS_PIN  10

MFRC522 mfrc522(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  while (!Serial);
  SPI.begin();
  mfrc522.PCD_Init();
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);
}

void loop() {
  // Listen for raw APDU-like commands over Serial
  if (Serial.available() >= 5) {
    byte header[5];
    Serial.readBytes(header, 5);
    
    // Command: FF CA 00 00 00 (Get UID)
    if (header[0] == 0xFF && header[1] == 0xCA) {
      handleGetUID();
    }
    // Command: FF B0 00 <page> 04 (Read Page)
    else if (header[0] == 0xFF && header[1] == 0xB0) {
      handleReadPage(header[3]);
    }
    // Command: FF D6 00 <page> 04 <4 bytes> (Write Page)
    else if (header[0] == 0xFF && header[1] == 0xD6) {
      byte data[4];
      Serial.readBytes(data, 4);
      handleWritePage(header[3], data);
    }
  }
}

void handleGetUID() {
  if (mfrc522.PICC_IsNewCardPresent() || mfrc522.PICC_ReadCardSerial()) {
    if (mfrc522.PICC_ReadCardSerial()) {
      Serial.write(mfrc522.uid.uidByte, mfrc522.uid.size);
      sendSuccess();
      return;
    }
  }
  sendError(0x63, 0x00);
}

void handleReadPage(byte page) {
  if (mfrc522.PICC_IsNewCardPresent() || mfrc522.PICC_ReadCardSerial()) {
    if (mfrc522.PICC_ReadCardSerial()) {
      byte buffer[18];
      byte size = sizeof(buffer);
      if (mfrc522.MIFARE_Read(page, buffer, &size) == MFRC522::STATUS_OK) {
        Serial.write(buffer, 4);
        sendSuccess();
        return;
      }
    }
  }
  sendError(0x63, 0x00);
}

void handleWritePage(byte page, byte* data) {
  if (mfrc522.PICC_IsNewCardPresent() || mfrc522.PICC_ReadCardSerial()) {
    if (mfrc522.PICC_ReadCardSerial()) {
      if (mfrc522.MIFARE_Ultralight_Write(page, data, 4) == MFRC522::STATUS_OK) {
        sendSuccess();
        return;
      }
    }
  }
  sendError(0x63, 0x00);
}

void sendSuccess() {
  Serial.write(0x90);
  Serial.write(0x00);
}

void sendError(byte sw1, byte sw2) {
  Serial.write(sw1);
  Serial.write(sw2);
}
