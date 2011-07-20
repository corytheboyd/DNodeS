CREATE TABLE zones (
  id INTEGER not null AUTO_INCREMENT not null,
  domain varchar(255) not null,
  nameserver varchar(255) not null,
  hostemail varchar(255) not null,
  serial INTEGER not null,
  refresh INTEGER not null,
  retry INTEGER not null,
  expire INTEGER not null,
  minttl INTEGER not null,
  PRIMARY KEY (id),
  UNIQUE KEY `idx_domain` (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
