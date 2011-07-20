CREATE TABLE records (
  id INTEGER not null AUTO_INCREMENT not null,
  zone varchar(255) not null,
  owner varchar(255) not null,
  class varchar(255) not null,
  type varchar(255) not null,
  content TEXT not null,
  PRIMARY KEY (id),
  FOREIGN KEY (zone) REFERENCES zones(domain) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
