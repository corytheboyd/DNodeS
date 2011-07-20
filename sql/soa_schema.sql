CREATE TABLE soa (
  id INTEGER not null AUTO_INCREMENT not null,
  zone varchar(255) not null,
  nameserver varchar(255) not null,
  hostemail varchar(255) not null,
  serial INTEGER not null,
  refresh INTEGER not null,
  retry INTEGER not null,
  expire INTEGER not null,
  minttl INTEGER not null,
  owner varchar(255) not null,
  PRIMARY KEY (id),
  FOREIGN KEY (zone) REFERENCES zones(domain) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
