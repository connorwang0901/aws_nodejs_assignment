packer {
  required_plugins {
    amazon = {
      version = ">= 1.0.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "source_ami" {
  type    = string
  default = "ami-06db4d78cb1d3bbf9" # debian 12 x86
}

variable "ssh_username" {
  type    = string
  default = "admin"
}

variable "subnet_id" {
  type    = string
  default = "subnet-0b86105152d9bed60"
}

variable "instance_type" {
  type    = string
  default = "t2.micro"
}

variable "ami_regions" {
  type    = list(string)
  default = ["us-east-1"]
}

variable "ami_user_list" {
  type    = list(string)
  default = ["081351421464"]
}

# https://www.packer.io/plugins/builders/amazon/ebs
source "amazon-ebs" "my-ami" {
  profile         = "dev"
  region          = "${var.aws_region}"
  ami_name        = "csye6225_${formatdate("YYYY_MM_DD_hh_mm_ss", timestamp())}"
  ami_description = "AMI for CSYE 6225"
  ami_regions     = var.ami_regions
  ami_users       = var.ami_user_list


  aws_polling {
    delay_seconds = 120
    max_attempts  = 50
  }

  instance_type = "${var.instance_type}"
  source_ami    = "${var.source_ami}"
  ssh_username  = "${var.ssh_username}"
  subnet_id     = "${var.subnet_id}"

}

build {
  sources = ["source.amazon-ebs.my-ami"]

  provisioner "file" {
    source      = "/home/runner/work/webapp/webapp/webapp-prod.zip"
    destination = "/home/admin/"
  }



  provisioner "shell" {
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive",
      "CHECKPOINT_DISABLE=1"
    ]
    inline = [
      "sudo apt-get update",
      "sudo apt-get upgrade -y",
      "sudo apt-get clean",
      "sudo apt install -y curl",
      "curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -",
      "sudo apt-get install -y nodejs",

      //unzip
      "sudo apt-get install unzip -y",
      "mkdir /home/admin/webapp-prod && unzip webapp-prod.zip -d /home/admin/webapp-prod/",

      //install dependecies
      "cd /home/admin/webapp-prod",
      "pwd",
      "sudo apt-get install npm -y",
      "sudo apt-get install nodejs -y ",
      "npm install",
      "npm audit fix",

      //install cloudwatch
      "wget https://amazoncloudwatch-agent.s3.amazonaws.com/debian/amd64/latest/amazon-cloudwatch-agent.deb",
      "sudo dpkg -i amazon-cloudwatch-agent.deb",
      "sudo systemctl start amazon-cloudwatch-agent",

      // copy service
      "sudo cp /home/admin/webapp-prod/csye6225.service /etc/systemd/system",

      //copy config
      "sudo cp amazon-cloudwatch-agent.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
      "npm install node-statsd --save",


      // Set the permissions the file
      "sudo groupadd csye6225",
      "sudo useradd -s /bin/false -g csye6225 -d /opt/csye6225 -m csye6225",
      "sudo chown -R csye6225:csye6225 /home/admin/webapp-prod",
      "sudo chmod -R 700 /home/admin/webapp-prod",

      //make directory log
      "sudo mkdir -p /var/log/webapp",
      "sudo chown -R csye6225:csye6225 /var/log/webapp",
      "sudo chmod -R 700 /var/log/webapp/",
    ]
  }

}